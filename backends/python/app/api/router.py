from fastapi import APIRouter

from app.api.routes import files, health, jobs, realtime, records, users, webhooks

api_router = APIRouter()
api_router.include_router(users.router, tags=["users"])
api_router.include_router(records.router, prefix="/records", tags=["records"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(realtime.router, tags=["realtime"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

root_router = APIRouter()
root_router.include_router(health.router)
