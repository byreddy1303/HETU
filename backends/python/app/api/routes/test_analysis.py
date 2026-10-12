from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.services.question_screenshots import OpenAIFile
from app.services.test_analysis import (
    TestAnalysisDraft,
    get_question_image,
    get_test_analysis,
    list_test_analyses,
    publish_test_analysis,
    save_test_analysis,
)

router = APIRouter()


class TestAnalysisRequest(TestAnalysisDraft):
    screenshots: list[OpenAIFile] = []


@router.post("")
async def save(
    draft: TestAnalysisRequest, identity: CurrentUser, db: DbDep, settings: SettingsDep
) -> dict:
    result = await save_test_analysis(
        db,
        owner_id=identity.user_id,
        draft=TestAnalysisDraft.model_validate(
            draft.model_dump(exclude={"screenshots"}, exclude_unset=True)
        ),
        screenshots=draft.screenshots,
        app_url=settings.app_url,
        origin="app",
    )
    await db.commit()
    await publish_test_analysis(identity.user_id, result)
    return result


@router.get("")
async def list_saved(
    identity: CurrentUser,
    db: DbDep,
    limit: int = Query(default=25, ge=1, le=100),
    cursor: str | None = None,
) -> dict:
    return await list_test_analyses(db, owner_id=identity.user_id, limit=limit, cursor=cursor)


@router.get("/{report_id}")
async def detail(report_id: str, identity: CurrentUser, db: DbDep) -> dict:
    return await get_test_analysis(db, owner_id=identity.user_id, report_id=report_id)


@router.get("/{report_id}/questions/{question_id}/image")
async def question_image(
    report_id: str, question_id: str, identity: CurrentUser, db: DbDep
) -> dict:
    return await get_question_image(
        db, owner_id=identity.user_id, report_id=report_id, question_id=question_id
    )
