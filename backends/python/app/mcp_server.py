"""Authenticated MCP resource server mounted on the existing FastAPI service."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings
from app.db.models import User, UserIdentity
from app.db.session import get_session_factory
from app.schemas import RecordQuery
from app.services.concept_review import (
    ReviewDraft,
    ReviewResponse,
    create_review,
    get_review,
    list_reviews,
    record_review_response,
)
from app.services.learning_library import (
    CaptureRequest,
    InsightRevision,
    capture_learning,
    learning_detail,
    revise_insight,
    search_learning,
)
from app.services.pyq_catalog import catalog_question, search_catalog
from app.services.pyq_practice import PyqAttemptDraft, submit_pyq_attempt
from app.services.section_context import (
    SECTION_COLLECTIONS,
)
from app.services.section_context import (
    section_overview as load_section_overview,
)
from app.services.section_context import (
    section_record_detail as load_section_record_detail,
)
from app.services.section_context import (
    section_records as load_section_records,
)
from app.services.workflows import (
    BriefStart,
    BriefUpdate,
    get_workflow,
    list_workflows,
    start_workflow,
    update_workflow,
)

READ_SCOPE = "hetu:read"
WRITE_SCOPE = "hetu:write"


class _BearerRequest:
    def __init__(self, token: str, url: str) -> None:
        self.headers = {"Authorization": f"Bearer {token}"}
        self.url = url


class ClerkOAuthVerifier:
    """Use Clerk's token verification endpoint, then constrain subject/client/scopes."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def verify_token(self, token: str) -> AccessToken | None:
        if not token.startswith("oat_") or not self.settings.clerk_secret_key:
            return None
        if not self.settings.allowed_mcp_clients:
            return None
        options = AuthenticateRequestOptions(
            secret_key=self.settings.clerk_secret_key.get_secret_value(),
            accepts_token=["oauth_token"],
        )
        try:
            state = await run_in_threadpool(
                authenticate_request,
                _BearerRequest(token, self.settings.mcp_resource_url or ""),
                options,
            )
        except Exception:
            return None
        if not state.is_signed_in:
            return None
        claims = state.payload or {}
        subject = claims.get("subject")
        client_id = claims.get("client_id")
        raw_scopes = claims.get("scopes", [])
        scopes = raw_scopes.split() if isinstance(raw_scopes, str) else raw_scopes
        if (
            not isinstance(subject, str)
            or not subject.startswith("user_")
            or not isinstance(client_id, str)
            or client_id not in self.settings.allowed_mcp_clients
            or not isinstance(scopes, list)
            or not all(isinstance(item, str) for item in scopes)
            or READ_SCOPE not in scopes
        ):
            return None
        audience = claims.get("aud") or claims.get("resource")
        audiences = audience if isinstance(audience, list) else [audience]
        if self.settings.mcp_resource_url not in audiences:
            return None
        return AccessToken(
            token=token,
            client_id=client_id,
            scopes=scopes,
            subject=subject,
            resource=self.settings.mcp_resource_url,
            expires_at=claims.get("exp") if isinstance(claims.get("exp"), int) else None,
            claims=claims,
        )


async def _user_id(db: AsyncSession, required_scope: str) -> str:
    access = get_access_token()
    if access is None or not access.subject or required_scope not in access.scopes:
        raise HTTPException(403, f"{required_scope} scope required")
    mapping = await db.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == "clerk", UserIdentity.subject == access.subject
        )
    )
    user_id = mapping.user_id if mapping else access.subject
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(403, "Connected HETU account is unavailable")
    return user_id


def _security(scope: str) -> dict[str, Any]:
    return {"securitySchemes": [{"type": "oauth2", "scopes": [scope]}]}


def create_mcp_server(settings: Settings) -> MCPServer:
    if not settings.mcp_resource_url or not settings.clerk_oauth_issuer:
        raise ValueError("MCP_RESOURCE_URL and CLERK_OAUTH_ISSUER are required")
    resource = urlparse(settings.mcp_resource_url)
    issuer = urlparse(settings.clerk_oauth_issuer)
    if (
        not resource.hostname
        or resource.path != "/mcp"
        or resource.query
        or resource.fragment
        or not issuer.hostname
        or issuer.scheme != "https"
        or not settings.allowed_mcp_clients
    ):
        raise ValueError("MCP needs canonical /mcp URL, HTTPS issuer, and allowed client IDs")
    if settings.environment in {"staging", "production"} and resource.scheme != "https":
        raise ValueError("Hosted MCP_RESOURCE_URL must use HTTPS")
    server = MCPServer(
        "HETU",
        description="Operate the connected learner's HETU preparation workspace.",
        instructions=(
            "Preserve the user's original goal, constraints, and corrections. "
            "Retrieve account evidence before acting; do not invent attempts, mastery, "
            "availability, or historical conversation access. Save useful learning "
            "from available conversation content with source attribution. Verify writes "
            "and report unresolved work."
        ),
        version="0.1.0",
        token_verifier=ClerkOAuthVerifier(settings),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(settings.clerk_oauth_issuer),
            resource_server_url=AnyHttpUrl(settings.mcp_resource_url),
            required_scopes=[READ_SCOPE],
            validate_token_resource=True,
        ),
    )

    @server.tool(
        description=(
            "Identify the connected HETU account. Never take an account ID from model input."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta={**_security(READ_SCOPE), "openai/profile": True},
    )
    async def get_profile() -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            user = await db.get(User, user_id)
            assert user is not None
            return {
                "profile_id": user.id,
                "display_name": user.display_name or user.username or "HETU learner",
                "email": user.email,
            }

    @server.tool(
        description="Report actual supported HETU operations and current limitations.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def get_capabilities() -> dict[str, Any]:
        async with get_session_factory()() as db:
            await _user_id(db, READ_SCOPE)
        return {
            "schema_version": "learning-v1",
            "supported": [
                "learning.capture",
                "learning.search",
                "learning.detail",
                "learning.revise",
                "workflow.start",
                "workflow.list",
                "workflow.detail",
                "workflow.update",
                "concept_review.create",
                "concept_review.list",
                "concept_review.detail",
                "concept_review.respond",
                "sections.list",
                "sections.mapped_record_overview",
                "sections.mapped_records",
                "sections.filtered_mapped_records",
                "sections.mapped_record_detail",
                "pyq.search_catalog",
                "pyq.question_detail",
                "pyq.submit_answer",
            ],
            "unavailable": [
                "production data cutover",
                "historical ChatGPT transcript access",
                "whole-app MCP actions",
            ],
        }

    @server.tool(
        description=(
            "Search saved concepts by text or subject; returns brief results and completeness."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def search_knowledge(
        query: str = "", subject: str | None = None, limit: int = 25, offset: int = 0
    ) -> dict[str, Any]:
        if not 1 <= limit <= 100 or offset < 0 or len(query) > 300:
            raise ValueError("Use limit 1–100, offset >= 0, and a query under 300 characters")
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await search_learning(
                db, owner_id=user_id, text=query, subject=subject, limit=limit, offset=offset
            )

    @server.tool(
        description=(
            "Get a concept's full explanation, insights, sources, and optional revision history."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def get_concept(concept_id: str, include_history: bool = False) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await learning_detail(
                db, owner_id=user_id, concept_id=concept_id, include_history=include_history
            )

    @server.tool(
        description=(
            "Save useful ideas from the available conversation, with sources and explicit "
            "reasoning provenance. Reuse the idempotency key for retries."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def save_to_hetu(request: CaptureRequest) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await capture_learning(
                db, owner_id=user_id, request=request, app_url=settings.app_url
            )
            await db.commit()
            return result

    @server.tool(
        description=(
            "Revise a saved insight at its expected version while retaining prior versions."
        ),
        annotations=ToolAnnotations(idempotent_hint=False),
        meta=_security(WRITE_SCOPE),
    )
    async def revise_saved_insight(insight_id: str, revision: InsightRevision) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await revise_insight(
                db, owner_id=user_id, insight_id=insight_id, revision=revision
            )
            await db.commit()
            return result

    @server.tool(
        description=(
            "Start a durable task brief that retains the user's goal, constraints, "
            "assumptions, references, pending steps, and success criteria."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def start_task_brief(start: BriefStart) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await start_workflow(
                db, owner_id=user_id, start=start, app_url=settings.app_url
            )
            await db.commit()
            return result

    @server.tool(
        description="List recent task briefs so an interrupted HETU task can be resumed.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def list_task_briefs(limit: int = 20) -> list[dict[str, Any]]:
        if not 1 <= limit <= 100:
            raise ValueError("Limit must be 1–100")
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await list_workflows(db, owner_id=user_id, limit=limit)

    @server.tool(
        description="Read a durable task brief including corrections and pending work.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def get_task_brief(workflow_id: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await get_workflow(db, owner_id=user_id, workflow_id=workflow_id)

    @server.tool(
        description=(
            "Record a correction, completed or pending step, receipt, or status in a "
            "task brief. Expected version and operation ID prevent lost or repeated updates."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def update_task_brief(workflow_id: str, update: BriefUpdate) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await update_workflow(
                db, owner_id=user_id, workflow_id=workflow_id, update=update
            )
            await db.commit()
            return result

    @server.tool(
        description=(
            "Create a recall or distinct transfer question for a saved concept. "
            "Creating a review does not record an answer or mastery."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def create_concept_review(draft: ReviewDraft) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await create_review(
                db, owner_id=user_id, draft=draft, app_url=settings.app_url
            )
            await db.commit()
            return result

    @server.tool(
        description="List concept questions, optionally only due items or a specific concept.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def list_concept_reviews(
        concept_id: str | None = None, due_only: bool = False, limit: int = 50
    ) -> list[dict[str, Any]]:
        if not 1 <= limit <= 100:
            raise ValueError("Limit must be 1–100")
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await list_reviews(
                db,
                owner_id=user_id,
                concept_id=concept_id,
                due_only=due_only,
                limit=limit,
            )

    @server.tool(
        description="Read a concept question and its actual response and assistance history.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def get_concept_review(review_id: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await get_review(db, owner_id=user_id, review_id=review_id)

    @server.tool(
        description=(
            "Record the learner's actual answer, help received, and graded or self-reported "
            "outcome. Never infer an answer or mark reading as mastery."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def record_concept_response(review_id: str, response: ReviewResponse) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await record_review_response(
                db, owner_id=user_id, review_id=review_id, response=response
            )
            await db.commit()
            return result

    @server.tool(
        description="List HETU sections with available underlying account records.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def list_sections() -> dict[str, Any]:
        async with get_session_factory()() as db:
            await _user_id(db, READ_SCOPE)
        return {"sections": sorted(SECTION_COLLECTIONS)}

    @server.tool(
        description=(
            "Get owner-scoped record counts and freshness for a HETU section. "
            "These are raw evidence, not computed readiness or mastery."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def inspect_section(section: str) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await load_section_overview(db, owner_id=user_id, section=section)

    @server.tool(
        description="Retrieve paginated detailed owner records for a mapped HETU section.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def read_section_records(
        section: str, collection: str, cursor: str | None = None, limit: int = 50
    ) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await load_section_records(
                db,
                owner_id=user_id,
                section=section,
                collection=collection,
                cursor=cursor,
                limit=limit,
            )

    @server.tool(
        description=(
            "Filter and page detailed owner records in a mapped HETU section. "
            "Use this to inspect subject, topic, date, or status evidence."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def query_section_records(
        section: str, collection: str, query: RecordQuery
    ) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await load_section_records(
                db, owner_id=user_id, section=section, collection=collection, query=query
            )

    @server.tool(
        description="Read one owner-scoped section record and its optional revision history.",
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def read_section_record(
        section: str,
        collection: str,
        record_id: str,
        include_history: bool = False,
    ) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, READ_SCOPE)
            return await load_section_record_detail(
                db,
                owner_id=user_id,
                section=section,
                collection=collection,
                record_id=record_id,
                include_history=include_history,
            )

    @server.tool(
        description=(
            "Search the canonical GATE PYQ catalog by subject, topic, year, or question text. "
            "Results identify missing marks and quarantined answers."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def search_pyq_catalog(
        subject_slug: str | None = None,
        topic_slug: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        text: str = "",
        limit: int = 25,
        offset: int = 0,
    ) -> dict[str, Any]:
        async with get_session_factory()() as db:
            await _user_id(db, READ_SCOPE)
            return await search_catalog(
                db,
                subject_slug=subject_slug,
                topic_slug=topic_slug,
                year_from=year_from,
                year_to=year_to,
                text=text,
                limit=limit,
                offset=offset,
            )

    @server.tool(
        description=(
            "Read a canonical PYQ and its source. The answer key is hidden by default; "
            "request it only after the learner answers or explicitly asks for an explanation. "
            "Quarantined keys are never exposed."
        ),
        annotations=ToolAnnotations(read_only_hint=True),
        meta=_security(READ_SCOPE),
    )
    async def get_pyq_question(question_uid: str, include_answer: bool = False) -> dict[str, Any]:
        async with get_session_factory()() as db:
            await _user_id(db, READ_SCOPE)
            result = await catalog_question(db, question_uid)
            if not include_answer:
                result["answer"] = None
                result["answer_hidden"] = True
            return result

    @server.tool(
        description=(
            "Record the learner's actual PYQ answer or skip, score it from the versioned "
            "canonical question, and return an immutable retry-safe receipt. "
            "Never fabricate a response or duration."
        ),
        annotations=ToolAnnotations(idempotent_hint=True),
        meta=_security(WRITE_SCOPE),
    )
    async def submit_pyq_answer(draft: PyqAttemptDraft) -> dict[str, Any]:
        async with get_session_factory()() as db:
            user_id = await _user_id(db, WRITE_SCOPE)
            result = await submit_pyq_attempt(
                db, owner_id=user_id, draft=draft, app_url=settings.app_url
            )
            await db.commit()
            return result

    return server
