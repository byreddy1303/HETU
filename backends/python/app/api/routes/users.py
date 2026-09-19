from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.db.models import User
from app.schemas import UserResponse, UserUpdate

router = APIRouter()


def _response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        profile=user.profile,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(identity: CurrentUser, db: DbDep) -> UserResponse:
    user = await db.get(User, identity.user_id)
    assert user is not None
    return _response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(payload: UserUpdate, identity: CurrentUser, db: DbDep) -> UserResponse:
    user = await db.get(User, identity.user_id)
    assert user is not None
    fields = payload.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(user, key, value)
    await db.commit()
    await db.refresh(user)
    return _response(user)
