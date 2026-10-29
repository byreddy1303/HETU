from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, DbDep
from app.api.routes.local_learning_engine import require_local_workspace
from app.services.daily_brief import daily_brief

router = APIRouter(dependencies=[Depends(require_local_workspace)])


@router.get("")
async def brief(identity: CurrentUser, db: DbDep, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return await daily_brief(db, identity.user_id)
