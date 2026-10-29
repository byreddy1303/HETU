from datetime import UTC, datetime
from unittest.mock import Mock

import pytest

from app.db.models import Record, User
from app.services.daily_brief import daily_brief
from scripts.daily_brief_launcher import launch_if_due


@pytest.mark.asyncio
async def test_brief_is_owned_answer_free_and_preserves_partial_states(db, monkeypatch):
    db.add_all([User(id="local_user"), User(id="other")])
    await db.flush()
    db.add(
        Record(
            owner_id="local_user",
            collection="planner_day_plans",
            external_id="2026-10-29",
            data={
                "plan": {
                    "sessions": [
                        {"id": "one", "target": "Study graphs", "durationMin": 20},
                        {
                            "id": "done",
                            "target": "Finished",
                            "execution": {"completedAt": "yesterday"},
                        },
                    ]
                }
            },
        )
    )
    db.add(
        Record(
            owner_id="other",
            collection="planner_day_plans",
            external_id="2026-10-29",
            data={"sessions": [{"target": "Private plan"}]},
        )
    )

    async def clock(_db, _owner):
        from datetime import date

        return "now", date(2026, 10, 29), "Asia/Kolkata"

    async def candidates(_db, _owner):
        return [
            {
                "item": {
                    "id": "one",
                    "scheduled_date": "2026-10-28",
                    "source_kind": "pyq",
                    "topic": "Memory",
                    "answer": "SECRET",
                }
            },
            {
                "item": {
                    "id": "done",
                    "scheduled_date": "2026-10-28",
                    "source_kind": "pyq",
                    "stage": "MASTERED",
                }
            },
            {"item": {"id": "concept", "scheduled_date": "2026-10-28", "source_kind": "concept"}},
        ], False

    async def concepts(_db, **_kwargs):
        return {
            "items": [
                {
                    "id": "concept",
                    "due_on": "2026-10-29",
                    "prompt": "SECRET",
                    "concept": {"topic": "Languages"},
                }
            ],
            "complete": True,
            "held_for_exam": False,
        }

    monkeypatch.setattr("app.services.daily_brief.account_clock", clock)
    monkeypatch.setattr("app.services.daily_brief.recovery_candidates", candidates)
    monkeypatch.setattr("app.services.daily_brief.concept_review_queue", concepts)
    await db.commit()
    brief = await daily_brief(db, "local_user")
    assert brief["planner"]["count"] == 1
    assert brief["reattempts"]["count"] == 1
    assert brief["reattempts"]["complete"] is False
    assert brief["concepts"]["count"] == 1
    assert "SECRET" not in str(brief) and "Private plan" not in str(brief)


def test_launcher_is_india_timed_once_daily_and_respects_disabled_preferences(
    tmp_path, monkeypatch
):
    import json

    settings = {"enabled": True, "autoLaunch": True, "time": "09:00", "last_shown_on": None}
    (tmp_path / "daily-brief.json").write_text(json.dumps(settings))
    monkeypatch.setattr("scripts.daily_brief_launcher._app_is_running", lambda _path: False)
    popen = Mock(return_value=Mock(pid=123))
    monkeypatch.setattr("scripts.daily_brief_launcher.subprocess.Popen", popen)
    assert not launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 3, 29, tzinfo=UTC))
    assert launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 3, 30, tzinfo=UTC))
    settings["last_shown_on"] = "2026-10-29"
    (tmp_path / "daily-brief.json").write_text(json.dumps(settings))
    assert not launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 9, tzinfo=UTC))
    assert popen.call_count == 1
    settings["enabled"] = False
    (tmp_path / "daily-brief.json").write_text(json.dumps(settings))
    assert not launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 30, 4, tzinfo=UTC))


def test_launcher_retries_failed_start_after_cooldown_but_not_a_running_app(tmp_path, monkeypatch):
    import json

    from scripts import daily_brief_launcher as launcher

    (tmp_path / "daily-brief.json").write_text(
        json.dumps({"enabled": True, "autoLaunch": True, "time": "09:00"})
    )
    running = False
    monkeypatch.setattr(launcher, "_app_is_running", lambda _path: running)
    popen = Mock(return_value=Mock(pid=123))
    monkeypatch.setattr(launcher.subprocess, "Popen", popen)
    app = tmp_path / "HETU"
    assert launch_if_due(tmp_path, app, datetime(2026, 10, 29, 3, 30, tzinfo=UTC))
    assert not launch_if_due(tmp_path, app, datetime(2026, 10, 29, 3, 34, tzinfo=UTC))
    running = True
    assert not launch_if_due(tmp_path, app, datetime(2026, 10, 29, 3, 40, tzinfo=UTC))
    running = False
    assert launch_if_due(tmp_path, app, datetime(2026, 10, 29, 3, 41, tzinfo=UTC))
    assert popen.call_count == 2


def test_launcher_handles_corrupt_marker_and_throttles_spawn_errors(tmp_path, monkeypatch):
    import json

    from scripts import daily_brief_launcher as launcher

    (tmp_path / "daily-brief.json").write_text(
        json.dumps({"enabled": True, "autoLaunch": True, "time": "09:00"})
    )
    (tmp_path / "daily-brief-launch.json").write_text("invalid JSON")
    monkeypatch.setattr(launcher, "_app_is_running", lambda _path: False)
    popen = Mock(side_effect=OSError("App unavailable"))
    monkeypatch.setattr(launcher.subprocess, "Popen", popen)
    with pytest.raises(OSError, match="App unavailable"):
        launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 3, 30, tzinfo=UTC))
    assert not launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 3, 31, tzinfo=UTC))
    popen.side_effect = None
    popen.return_value = Mock(pid=456)
    assert launch_if_due(tmp_path, tmp_path / "HETU", datetime(2026, 10, 29, 3, 36, tzinfo=UTC))
    assert popen.call_count == 2
