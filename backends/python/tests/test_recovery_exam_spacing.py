from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.db.models import User
from app.services import recovery
from app.services.records import upsert_records
from app.services.recovery_engine import (
    exam_interval,
    final_pass_date,
    forecast,
    rank_candidates,
    transition,
)
from tests.test_recovery import APP, NOW, TODAY, answer, due_item, practice_attempt, setup, start

EXAM = date(2027, 2, 6)


def at(day: date) -> str:
    return datetime(day.year, day.month, day.day, 6, tzinfo=UTC).isoformat()


def item(stage="D3", due="2027-01-13", **fields):
    return {
        "id": "item-1",
        "stage": stage,
        "scheduled_date": due,
        "recovery_state": "active",
        "reason_flags": [],
        "lapse_count": 0,
        "successful_retrieval_count": 0,
        **fields,
    }


def step(data, grade, day):
    return transition(
        data, grade=grade, today=day, occurred_at=at(day), qualification="canonical", exam_date=EXAM
    )


def test_gaps_shrink_to_a_quarter_of_the_days_left():
    assert exam_interval(30, date(2026, 11, 23), EXAM) == 19  # 75 days left
    assert exam_interval(10, date(2026, 11, 23), EXAM) == 10
    assert exam_interval(30, date(2027, 1, 17), EXAM) == 5  # 20 days left
    assert exam_interval(10, date(2027, 1, 27), EXAM) == 3  # 10 days left
    assert exam_interval(3, date(2027, 2, 4), EXAM) == 1  # never on or after the exam
    assert exam_interval(3, date(2027, 2, 5), EXAM) == 3  # no slot left; leave as is
    assert exam_interval(30, date(2027, 3, 1), EXAM) == 30  # after the exam
    assert exam_interval(30, date(2026, 11, 23), None) == 30
    assert exam_interval(None, date(2026, 11, 23), EXAM) is None


def test_a_mistake_from_10_january_is_checked_twice_and_again_in_the_final_pass():
    # Missed on 10 Jan: the first check stays three days out.
    first_gap = exam_interval(3, date(2027, 1, 10), EXAM)
    assert first_gap == 3
    d3 = item(due="2027-01-13")
    d10 = step(d3, "good", date(2027, 1, 13))
    assert d10["item"]["stage"] == "D10"
    assert d10["item"]["scheduled_date"] == "2027-01-19"  # 6 days, not 10
    assert "sooner because the exam is close" in d10["explanation"]
    d30 = step(d10["item"], "good", date(2027, 1, 19))
    assert d30["item"]["stage"] == "D30"
    assert d30["item"]["scheduled_date"] == "2027-01-24"  # 5 days, not 30
    mastered = step(d30["item"], "good", date(2027, 1, 24))
    assert mastered["mastered"] is True
    assert mastered["item"]["recovery_state"] == "mastered"
    last_look = mastered["item"]["scheduled_date"]
    assert "2027-01-27" <= last_look <= "2027-02-04"
    assert last_look in mastered["explanation"]
    # The final pass keeps mastery and closes the loop.
    final = step(mastered["item"], "good", date.fromisoformat(last_look))
    assert final["mastered"] is True
    assert final["item"]["recovery_state"] == "mastered"
    assert final["item"]["scheduled_date"] is None
    assert final["item"]["mastered_at"] == mastered["item"]["mastered_at"]
    assert final["item"]["final_pass_at"] == at(date.fromisoformat(last_look))
    assert final["explanation"].startswith("Final pass done")


def test_a_missed_final_pass_goes_back_on_the_ladder():
    data = item(stage="MASTERED", due="2027-01-30", recovery_state="mastered")
    missed = step(data, "again", date(2027, 1, 30))
    assert missed["item"]["stage"] == "D3"
    assert missed["item"]["recovery_state"] == "active"
    assert missed["item"]["lapse_count"] == 1
    assert missed["item"]["scheduled_date"] == "2027-02-01"  # a quarter of 7 days, rounded
    shaky = step(data, "hard", date(2027, 1, 30))
    assert shaky["item"]["stage"] == "D30"
    assert shaky["item"]["scheduled_date"] == "2027-02-01"


def test_an_early_answer_never_strips_mastery():
    data = item(
        stage="MASTERED", due="2027-01-30", recovery_state="mastered", mastered_at="2027-01-05"
    )
    early = step(data, "good", date(2027, 1, 20))
    assert early["item"]["recovery_state"] == "mastered"
    assert early["item"]["mastered_at"] == "2027-01-05"
    assert early["item"]["scheduled_date"] == "2027-01-30"


def test_mastery_late_in_the_run_skips_the_final_pass():
    assert final_pass_date("x", date(2027, 1, 28), EXAM) is None
    assert final_pass_date("x", date(2026, 12, 1), None) is None
    days = {final_pass_date(f"item-{n}", date(2026, 12, 1), EXAM) for n in range(60)}
    assert min(days) >= date(2027, 1, 27) and max(days) <= date(2027, 2, 4)
    assert len(days) > 3  # spread across the window, not piled on one day


def test_final_passes_join_sprints_only_once_due():
    def candidate(id_, due, state):
        return {
            "item": item(id=id_, due=due, recovery_state=state, subject="OS"),
            "estimatedSeconds": 120,
        }

    today = date(2027, 1, 28)
    ranked = rank_candidates(
        [
            candidate("due-pass", "2027-01-28", "mastered"),
            candidate("future-pass", "2027-02-02", "mastered"),
            candidate("open", "2027-01-28", "active"),
        ],
        today,
    )
    assert [row["item"]["id"] for row in ranked] == ["due-pass", "open"] or [
        row["item"]["id"] for row in ranked
    ] == ["open", "due-pass"]
    assert "final pass" in next(r for r in ranked if r["item"]["id"] == "due-pass")["reasons"]
    days = forecast([candidate("future-pass", "2027-02-02", "mastered")], today, 7)
    assert days[5]["itemCount"] == 1


def test_profile_exam_date_overrides_the_default():
    assert recovery.account_exam_date(User(id="a", profile={"exam_date": "2027-02-13"})) == date(
        2027, 2, 13
    )
    assert recovery.account_exam_date(User(id="b", profile={"exam_date": "soon"})) == EXAM
    assert recovery.account_exam_date(User(id="c", profile={})) == EXAM


async def make_final_pass_due(db, row):
    saved = (
        await upsert_records(
            db,
            owner_id="one",
            collection="learning_items",
            items=[
                {
                    "id": row.external_id,
                    "expected_version": row.version,
                    **row.data,
                    "stage": "MASTERED",
                    "recovery_state": "mastered",
                    "mastered_at": "2026-09-01T00:00:00+00:00",
                    "scheduled_date": TODAY.isoformat(),
                }
            ],
        )
    )[0]
    await db.commit()
    return saved


@pytest.mark.asyncio
async def test_a_due_final_pass_can_be_answered_in_a_session(db, monkeypatch):
    await setup(db, monkeypatch)
    row = await due_item(db, "D30")
    await make_final_pass_due(
        db, await recovery.owned(db, "one", "learning_items", row.external_id)
    )
    session = await start(db, "final-pass-session")
    result = await recovery.record_answer(
        db,
        owner_id="one",
        session_id=session["id"],
        draft=answer(session, "final-pass-answer"),
        app_url=APP,
    )
    await db.commit()
    assert result["item"]["recovery_state"] == "mastered"
    assert result["item"]["scheduled_date"] is None
    assert result["item"]["mastered_at"] == "2026-09-01T00:00:00+00:00"
    # A final pass is not a second mastery.
    assert [event["event_type"] for event in result["events"]] == ["retrieval_good"]


@pytest.mark.asyncio
async def test_a_correct_practice_answer_counts_as_the_final_pass(db, monkeypatch):
    await setup(db, monkeypatch)
    first = await practice_attempt(
        db, "final-original", "A", datetime(2026, 10, 1, 4, 0, tzinfo=UTC)
    )
    row = await recovery.owned(db, "one", "learning_items", first["item"]["id"])
    await make_final_pass_due(db, row)
    solved = await practice_attempt(db, "final-practice", "B", NOW)
    await db.commit()
    assert solved["credit"]["credited"] is True
    assert solved["credit"]["final_pass"] is True
    assert solved["item"]["recovery_state"] == "mastered"
    assert solved["item"]["scheduled_date"] is None
