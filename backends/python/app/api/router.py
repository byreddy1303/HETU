from fastapi import APIRouter

from app.api.routes import (
    access,
    compat,
    concept_reviews,
    files,
    health,
    jobs,
    learning,
    learning_concept_bridge,
    local_learning_engine,
    pyq_catalog,
    realtime,
    records,
    recovery,
    revision_pack,
    section_context,
    study_actions,
    study_memory,
    test_analysis,
    users,
    webhooks,
    workflows,
)

api_router = APIRouter()
api_router.include_router(users.router, tags=["users"])
api_router.include_router(compat.router, prefix="/compat", tags=["compatibility"])
api_router.include_router(access.router, prefix="/access", tags=["access"])
api_router.include_router(records.router, prefix="/records", tags=["records"])
api_router.include_router(recovery.router, prefix="/recovery", tags=["recovery"])
api_router.include_router(pyq_catalog.router, prefix="/pyq", tags=["pyq"])
api_router.include_router(learning.router, prefix="/learning", tags=["learning"])
api_router.include_router(
    learning_concept_bridge.router, prefix="/learning/concept-bridge", tags=["concept-reviews"]
)
api_router.include_router(revision_pack.router, prefix="/revision-pack", tags=["revision-pack"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
api_router.include_router(
    concept_reviews.router, prefix="/concept-reviews", tags=["concept-reviews"]
)
api_router.include_router(section_context.router, prefix="/sections", tags=["sections"])
api_router.include_router(study_actions.router, prefix="/study-actions", tags=["study-actions"])
api_router.include_router(study_memory.router, prefix="/study-memory", tags=["study-memory"])
api_router.include_router(
    local_learning_engine.router, prefix="/study-memory/engine", tags=["local-learning"]
)
api_router.include_router(test_analysis.router, prefix="/test-analyses", tags=["test-analysis"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(realtime.router, tags=["realtime"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])

root_router = APIRouter()
root_router.include_router(health.router)
