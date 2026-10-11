"""Transparent recovery rules shared by app and MCP domain operations."""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Literal

Grade = Literal["again", "hard", "good", "easy"]
Mode = Literal["minutes-10", "minutes-20", "minutes-30", "questions-5", "all"]


def derive_grade(
    *,
    correct: bool,
    blank: bool,
    seconds: float | None,
    target_seconds: float,
    confidence: str | None,
    assisted: bool,
    prior_successes: int,
) -> dict[str, Any]:
    if not correct or blank:
        return {"grade": "again", "reasons": ["left blank" if blank else "answer was not correct"]}
    pace = seconds / max(1, target_seconds) if seconds is not None else None
    reasons = []
    if assisted:
        reasons.append("opening cue revealed")
    if confidence == "low":
        reasons.append("low confidence")
    if pace is not None and pace > 1.25:
        reasons.append("over 125% of target time")
    if reasons:
        return {"grade": "hard", "reasons": reasons}
    if confidence == "high" and pace is not None and pace <= 0.7 and prior_successes > 0:
        return {
            "grade": "easy",
            "reasons": ["high confidence", "under 70% of target time", "supported by prior recall"],
        }
    return {
        "grade": "good",
        "reasons": [
            "correct",
            "hint-free",
            f"{confidence} confidence" if confidence else "confidence not recorded",
            "timing not recorded"
            if pace is None
            else "within target time"
            if pace <= 1
            else "near target time",
        ],
    }


def next_stage(stage: str, grade: Grade) -> tuple[str, int | None]:
    if grade == "again":
        return ("D10", 3) if stage in {"TRANSFER", "D30"} else ("D3", 3)
    if grade == "hard":
        return {
            "MASTERED": ("D30", 10),
            "TRANSFER": ("TRANSFER", 3),
            "D30": ("D30", 10),
            "D10": ("D10", 5),
        }.get(stage, ("D3", 3))
    if stage in {"MASTERED", "TRANSFER", "D30"}:
        return "MASTERED", None
    if stage == "D10" or grade == "easy":
        return "D30", 30
    return "D10", 10


def transition(
    item: dict[str, Any],
    *,
    grade: Grade,
    today: date,
    occurred_at: str,
    qualification: Literal["canonical", "reported", "ungraded"],
    fresh_transfer: bool = False,
) -> dict[str, Any]:
    stage, interval = next_stage(item["stage"], grade)
    due = item.get("scheduled_date")
    due_now = isinstance(due, str) and due <= today.isoformat()
    qualified = grade in {"good", "easy"} and qualification == "canonical" and due_now
    # Self/assistant assessments stay visible without upgrading them to verified mastery.
    mastered = (
        stage == "MASTERED"
        and qualified
        and (item["stage"] == "D30" or (item["stage"] == "TRANSFER" and fresh_transfer))
    )
    if stage == "MASTERED" and not mastered:
        stage, interval = ("TRANSFER", 3) if item["stage"] == "TRANSFER" else ("D30", 10)
    # An early rehearsal is evidence, but cannot advance a due-retrieval ladder.
    if not due_now and grade in {"good", "easy"}:
        stage, interval = item["stage"], item.get("last_interval_days")
        scheduled = due
    else:
        scheduled = (today + timedelta(days=interval)).isoformat() if interval else None
    lapse_count = int(item.get("lapse_count", 0)) + int(grade == "again")
    remediation = grade == "again" and lapse_count >= 3
    flags = list(item.get("reason_flags", []))
    if remediation and "recurring-lapse" not in flags:
        flags.append("recurring-lapse")
    updated = {
        **item,
        "stage": stage,
        "scheduled_date": scheduled,
        "recovery_state": "mastered"
        if mastered
        else "remediation"
        if remediation
        else "transfer"
        if stage == "TRANSFER"
        else "active",
        "reason_flags": flags,
        "lapse_count": lapse_count,
        "successful_retrieval_count": int(item.get("successful_retrieval_count", 0))
        + int(grade in {"good", "easy"} and due_now),
        "last_grade": grade,
        "last_interval_days": interval,
        "successful_due_d30_at": occurred_at
        if mastered and item["stage"] == "D30"
        else item.get("successful_due_d30_at"),
        "transfer_passed_at": occurred_at
        if mastered and item["stage"] == "TRANSFER"
        else item.get("transfer_passed_at"),
        "mastered_at": occurred_at if mastered else None,
        "updated_at": occurred_at,
    }
    explanation = (
        "Fresh transfer solved; canonical mastery evidence recorded."
        if mastered and item["stage"] == "TRANSFER"
        else "Due D30 retrieval passed; canonical mastery evidence recorded."
        if mastered
        else "Early rehearsal recorded; the due retrieval remains scheduled."
        if not due_now and grade in {"good", "easy"}
        else "Assessment recorded; canonical due recall is still required for verified mastery."
        if qualification != "canonical" and item["stage"] in {"D30", "TRANSFER"}
        else f"Again at {item['stage']}; focused remediation is required."
        if remediation
        else f"{grade.capitalize()} at {item['stage']}; next {stage} retrieval in {interval} days."
    )
    return {
        "item": updated,
        "intervalDays": interval,
        "explanation": explanation,
        "mastered": mastered,
    }


def rank_candidates(candidates: list[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    result = []
    for candidate in candidates:
        item = candidate["item"]
        if item.get("recovery_state") in {"mastered", "paused"} or not item.get("scheduled_date"):
            continue
        due = date.fromisoformat(item["scheduled_date"])
        overdue = max(0, (today - due).days)
        reasons = []
        score = 100 if due <= today else max(0, 30 - (due - today).days * 4)
        if overdue:
            score += min(80, overdue * 6)
            reasons.append(f"{overdue}d overdue")
        elif due <= today:
            reasons.append("due today")
        lapses = item.get("lapse_count", 0)
        score += lapses * 14
        if lapses:
            reasons.append(f"{lapses} lapse{'s' if lapses != 1 else ''}")
        for enabled, weight, label in (
            (item.get("recovery_state") == "remediation", 35, "remediation"),
            (item.get("analysis_state") == "pending", 5, "analysis pending"),
            (candidate.get("marks") == 2, 8, "2 marks"),
            (candidate.get("weeklyFocus"), 12, "weekly focus"),
            (candidate.get("confidenceSurprise"), 18, "confidence surprise"),
        ):
            if enabled:
                score += weight
                reasons.append(label)
        result.append(
            {
                **candidate,
                "estimatedSeconds": max(30, candidate["estimatedSeconds"]),
                "score": score,
                "overdueDays": overdue,
                "reasons": reasons or ["scheduled review"],
            }
        )
    return sorted(
        result, key=lambda row: (-row["score"], row["item"]["scheduled_date"], row["item"]["id"])
    )


def build_sprint(candidates: list[dict[str, Any]], mode: Mode, today: date) -> dict[str, Any]:
    remaining = rank_candidates(candidates, today)
    ranked = []
    last_subject = None
    while remaining:
        index = next(
            (i for i, row in enumerate(remaining) if row["item"]["subject"] != last_subject), 0
        )
        row = remaining.pop(index)
        ranked.append(row)
        last_subject = row["item"]["subject"]
    seconds_limit = {"minutes-10": 600, "minutes-20": 1200, "minutes-30": 1800}.get(mode)
    count_limit = 5 if mode == "questions-5" else 100
    selected, seconds = [], 0
    for row in ranked:
        if len(selected) >= count_limit:
            break
        if seconds_limit is not None and seconds + row["estimatedSeconds"] > seconds_limit:
            continue
        selected.append(row)
        seconds += row["estimatedSeconds"]
    selected_ids = {row["item"]["id"] for row in selected}
    deferred = [row for row in ranked if row["item"]["id"] not in selected_ids]
    return {
        "mode": mode,
        "selected": selected,
        "mustRecoverToday": [
            row for row in selected if row["item"]["scheduled_date"] <= today.isoformat()
        ],
        "ifTime": deferred[:3],
        "estimatedSeconds": seconds,
        "deferredCount": len(deferred),
        "timeBudgetSeconds": seconds_limit,
        "selectionLimit": count_limit,
    }


def forecast(candidates: list[dict[str, Any]], today: date, days: int = 7) -> list[dict[str, Any]]:
    result = [
        {
            "date": (today + timedelta(days=i)).isoformat(),
            "itemCount": 0,
            "estimatedMinutes": 0,
            "overdue": 0,
        }
        for i in range(days)
    ]
    for row in candidates:
        item = row["item"]
        if item.get("recovery_state") in {"mastered", "paused"} or not item.get("scheduled_date"):
            continue
        offset = (date.fromisoformat(item["scheduled_date"]) - today).days
        index = max(0, offset)
        if index >= len(result):
            continue
        result[index]["itemCount"] += 1
        result[index]["estimatedMinutes"] += max(1, math.ceil(row["estimatedSeconds"] / 60))
        result[index]["overdue"] += int(offset < 0)
    return result
