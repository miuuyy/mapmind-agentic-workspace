import json
from datetime import datetime, timezone
from hashlib import sha1
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PydanticBaseModel

from app.core.config import Settings, get_settings
from app.models.api import GraphExportRequest, GraphImportRequest, GraphLayoutPositionRequest, RenameGraphRequest, TopicArtifactInput, TopicResourceInput, UpdateGraphLayoutRequest
from app.models.domain import Artifact, ChatMessage, CreateGraphRequest, GraphChatRequest, GraphProposal, GraphProposalEnvelope, InlineChatQuiz, ProposalGenerateRequest, QuizQuestionPublic, QuizStartRequest, QuizStartResponse, QuizSubmitRequest, QuizSubmitResponse, ResourceLink, StudyAssistantRequest, StudyAssistantResponse, TopicQuizSessionPublic, UpdateWorkspaceConfigRequest
from app.services.assessment_service import AssessmentService
from app.services.debug_log_service import DebugClientLogRequest, get_debug_log_service
from app.services.chat_orchestrator import ChatOrchestratorError, ChatOrchestratorService
from app.services.gemini_planner import GeminiPlanner, GeminiPlannerError
from app.services.proposal_normalizer import ProposalNormalizer
from app.services.quiz_service import QuizService
from app.services.repository import ChatSessionDeletionError, ChatSessionNotFoundError, GraphRepository
from app.services.study_assistant import StudyAssistantError, StudyAssistantService

router = APIRouter()


def get_repository(settings: Settings = Depends(get_settings)) -> GraphRepository:
    return GraphRepository(settings.db_path)


def get_effective_settings(
    settings: Settings = Depends(get_settings),
    repository: GraphRepository = Depends(get_repository),
) -> Settings:
    """Merge workspace-level token limit overrides into base settings."""
    workspace_config = repository.current().workspace.config
    return settings.with_workspace_overrides(workspace_config)


def get_planner(settings: Settings = Depends(get_effective_settings)) -> GeminiPlanner:
    try:
        return GeminiPlanner(settings)
    except GeminiPlannerError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_normalizer() -> ProposalNormalizer:
    return ProposalNormalizer()


def get_quiz_service(settings: Settings = Depends(get_effective_settings)) -> QuizService:
    return QuizService(settings)


def get_assessment_service() -> AssessmentService:
    return AssessmentService()


def get_study_assistant(settings: Settings = Depends(get_effective_settings)) -> StudyAssistantService:
    return StudyAssistantService(settings)


def get_chat_orchestrator(
    settings: Settings = Depends(get_effective_settings),
    planner: GeminiPlanner = Depends(get_planner),
) -> ChatOrchestratorService:
    return ChatOrchestratorService(settings, planner)


def get_debug_logs(settings: Settings = Depends(get_settings)):
    return get_debug_log_service(settings.root_dir)


def ensure_debug_logs_enabled(repository: GraphRepository = Depends(get_repository)) -> None:
    if not repository.current().workspace.config.debug_mode_enabled:
        raise HTTPException(status_code=403, detail="debug logs are disabled")


def _local_workspace_surface(repository: GraphRepository) -> dict:
    workspace = repository.current().workspace
    graph_count = len(workspace.graphs)
    demo_graph_count = sum(1 for graph in workspace.graphs if bool(graph.metadata.get("demo")))
    personal_graph_count = max(0, graph_count - demo_graph_count)
    active_graph_id = workspace.active_graph_id or (workspace.graphs[0].graph_id if workspace.graphs else None)
    return {
        "onboarding_state": "active_workspace" if graph_count > 0 else "needs_first_graph",
        "active_graph_id": active_graph_id,
        "graph_count": graph_count,
        "personal_graph_count": personal_graph_count,
        "demo_graph_count": demo_graph_count,
        "graph_limit": 9999,
        "library_post_count": 0,
        "demo_library_post_id": None,
        "primary_action": "resume_workspace" if graph_count > 0 else "create_graph",
        "recommended_actions": ["resume_workspace"] if graph_count > 0 else ["create_graph"],
        "can_create_graph": True,
        "can_import_from_library": False,
        "grounding_default_enabled": workspace.config.use_google_search_grounding,
    }

def _local_user(settings: Settings) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": "local-user",
        "name": settings.local_user_name,
        "email": settings.local_user_email,
        "avatar_url": None,
        "ui_language": "en",
        "created_at": now,
        "last_login_at": now,
        "active_workspace_id": "default",
    }


def _workspace_config_payload(envelope, settings: Settings) -> dict:
    payload = envelope.model_dump(mode="json")
    config = payload["workspace"]["config"]
    config["gemini_api_key_source"] = "env" if settings.gemini_api_key_from_env else ("workspace" if config.get("gemini_api_key") else "unset")
    config["openai_api_key_source"] = "env" if settings.openai_api_key_from_env else ("workspace" if config.get("openai_api_key") else "unset")
    config["openai_base_url_source"] = "env" if settings.openai_base_url_from_env else "workspace"
    if settings.gemini_api_key_from_env:
        config["gemini_api_key"] = None
    if settings.openai_api_key_from_env:
        config["openai_api_key"] = None
    if settings.openai_base_url_from_env:
        config["openai_base_url"] = settings.openai_base_url
    return payload


def _resource_label_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    host = parsed.netloc.replace("www.", "") if parsed.netloc else ""
    path = parsed.path.rstrip("/")
    tail = path.split("/")[-1] if path else ""
    if host and tail:
        return f"{host}/{tail}"
    if host:
        return host
    return url.strip()


def _normalize_resource_url(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if not parsed.scheme:
        value = f"https://{value}"
        parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return ""
    if not parsed.netloc:
        return ""
    return value


@router.get("/healthz")
def healthz(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "ok": True,
        "app": settings.app_name,
        "model_default": settings.default_model,
    }


@router.get("/api/v1/meta/protocol")
def protocol(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "workspace_shape": "many isolated graphs + shared config",
        "topic_states": ["not_started", "learning", "shaky", "solid", "mastered", "needs_review"],
        "edge_relations": ["requires", "supports", "bridges", "extends", "reviews"],
        "proposal_contract": "/contracts/graph_patch.schema.json",
        "default_model": settings.default_model,
        "guarantees": [
            "topic-first graph",
            "proposal before mutation",
            "snapshot after apply",
            "rollback available",
        ],
    }


@router.get("/api/v1/workspace/current")
def current_workspace(
    repository: GraphRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    envelope = repository.current()
    return _workspace_config_payload(envelope, settings)


@router.get("/api/v1/workspace/surface")
def workspace_surface(repository: GraphRepository = Depends(get_repository)) -> dict:
    return _local_workspace_surface(repository)


@router.get("/api/v1/auth/session")
def auth_session(
    settings: Settings = Depends(get_settings),
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    return {
        "authenticated": True,
        "user": _local_user(settings),
        "workspace_surface": _local_workspace_surface(repository),
    }


@router.get("/api/v1/debug/logs")
def debug_logs_snapshot(
    _: None = Depends(ensure_debug_logs_enabled),
    debug_logs=Depends(get_debug_logs),
) -> dict:
    return debug_logs.snapshot().model_dump(mode="json")


@router.post("/api/v1/debug/logs/client")
def debug_logs_client_ingest(
    request: DebugClientLogRequest,
    _: None = Depends(ensure_debug_logs_enabled),
    debug_logs=Depends(get_debug_logs),
) -> dict:
    entry = debug_logs.ingest_client_entry(request)
    return {"ok": True, "entry": entry.model_dump(mode="json")}


@router.get("/api/v1/workspace/graphs")
def workspace_graphs(repository: GraphRepository = Depends(get_repository)) -> dict:
    return {
        "items": [summary.model_dump(mode="json") for summary in repository.graph_summaries()],
    }


@router.post("/api/v1/workspace/graphs")
def create_workspace_graph(request: CreateGraphRequest, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        workspace = repository.create_graph(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, get_settings())


@router.delete("/api/v1/workspace/graphs/{graph_id}")
def delete_workspace_graph(graph_id: str, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        workspace = repository.delete_graph(graph_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, get_settings())


@router.post("/api/v1/workspace/graphs/{graph_id}/rename")
def rename_workspace_graph(
    graph_id: str,
    request: RenameGraphRequest,
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    try:
        workspace = repository.rename_graph(graph_id, request.title)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, get_settings())


@router.post("/api/v1/workspace/graphs/{graph_id}/layout")
def update_workspace_graph_layout(
    graph_id: str,
    request: UpdateGraphLayoutRequest,
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    try:
        workspace = repository.update_graph_layout(
            graph_id,
            {topic_id: position.model_dump(mode="json") for topic_id, position in request.positions.items()},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, get_settings())


@router.post("/api/v1/workspace/graphs/{graph_id}/topics/{topic_id}/resources")
def append_topic_resource(
    graph_id: str,
    topic_id: str,
    body: TopicResourceInput,
    repository: GraphRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    normalized_url = _normalize_resource_url(body.url)
    if not normalized_url:
        raise HTTPException(status_code=400, detail="resource url is required")
    resource = ResourceLink(
        id=f"resource-{sha1(normalized_url.encode('utf-8')).hexdigest()[:12]}",
        label=_resource_label_from_url(normalized_url),
        url=normalized_url,
        kind="link",
    )
    try:
        workspace = repository.append_topic_resource(graph_id, topic_id, resource)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
    return _workspace_config_payload(workspace, settings)


@router.post("/api/v1/workspace/graphs/{graph_id}/topics/{topic_id}/artifacts")
def append_topic_artifact(
    graph_id: str,
    topic_id: str,
    body: TopicArtifactInput,
    repository: GraphRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    normalized_title = body.title.strip()
    normalized_body = body.body.strip()
    if not normalized_title:
        raise HTTPException(status_code=400, detail="artifact title is required")
    if not normalized_body:
        raise HTTPException(status_code=400, detail="artifact body is required")
    artifact_id_source = f"{graph_id}:{topic_id}:{normalized_title}:{normalized_body}"
    artifact = Artifact(
        id=f"artifact-{sha1(artifact_id_source.encode('utf-8')).hexdigest()[:12]}",
        title=normalized_title,
        kind="note",
        body=normalized_body,
    )
    try:
        workspace = repository.append_topic_artifact(graph_id, topic_id, artifact)
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
    return _workspace_config_payload(workspace, settings)


@router.post("/api/v1/workspace/graphs/{graph_id}/export")
def export_workspace_graph(
    graph_id: str,
    request: GraphExportRequest,
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    try:
        package = repository.export_graph_package(
            graph_id,
            title=request.title,
            include_progress=request.include_progress,
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return package.model_dump(mode="json")


@router.post("/api/v1/workspace/graphs/import")
def import_workspace_graph(
    request: GraphImportRequest,
    repository: GraphRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        workspace = repository.import_graph_package(
            request.package,
            title=request.title,
            include_progress=request.include_progress,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, settings)


@router.post("/api/v1/workspace/config")
def update_workspace_config(
    request: UpdateWorkspaceConfigRequest,
    repository: GraphRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> dict:
    if settings.gemini_api_key_from_env and request.gemini_api_key is not None:
        raise HTTPException(status_code=400, detail="gemini api key is locked by environment")
    if settings.openai_api_key_from_env and request.openai_api_key is not None:
        raise HTTPException(status_code=400, detail="openai api key is locked by environment")
    if settings.openai_base_url_from_env and request.openai_base_url is not None:
        raise HTTPException(status_code=400, detail="openai base url is locked by environment")
    try:
        workspace = repository.update_workspace_config(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(workspace, settings)


@router.get("/api/v1/graphs/{graph_id}")
def graph_by_id(graph_id: str, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    return graph.model_dump(mode="json")


@router.get("/api/v1/graphs/{graph_id}/assessment")
def graph_assessment(
    graph_id: str,
    repository: GraphRepository = Depends(get_repository),
    assessment_service: AssessmentService = Depends(get_assessment_service),
) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    return assessment_service.assess_graph(graph).model_dump(mode="json")


@router.get("/api/v1/graph/current")
def current_graph(repository: GraphRepository = Depends(get_repository)) -> dict:
    envelope = repository.current()
    graph_id = envelope.workspace.active_graph_id or (envelope.workspace.graphs[0].graph_id if envelope.workspace.graphs else None)
    if graph_id is None:
        raise HTTPException(status_code=404, detail="no graphs found")
    graph = repository.graph(graph_id)
    return graph.model_dump(mode="json")


@router.get("/api/v1/graph/snapshots")
def graph_snapshots(repository: GraphRepository = Depends(get_repository)) -> dict:
    return {
        "items": [record.model_dump(mode="json") for record in repository.list_snapshots()],
    }


@router.post("/api/v1/graph/proposals")
def graph_proposals(proposal: GraphProposal, repository: GraphRepository = Depends(get_repository)) -> dict:
    event_id = repository.append_event("graph.proposal", proposal.model_dump(mode="json"))
    return {
        "accepted": True,
        "event_id": event_id,
        "graph_id": proposal.graph_id,
        "operation_count": len(proposal.operations),
    }


@router.post("/api/v1/graphs/{graph_id}/propose")
def propose_graph_changes(
    graph_id: str,
    request: ProposalGenerateRequest,
    repository: GraphRepository = Depends(get_repository),
    planner: GeminiPlanner = Depends(get_planner),
) -> dict:
    try:
        graph = repository.graph(graph_id)
        result = planner.generate_proposal(graph, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    except GeminiPlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    repository.append_event(
        "graph.proposal.generated",
        {
            "graph_id": graph_id,
            "mode": request.mode,
            "summary": result.display.summary,
            "operation_count": len(result.proposal_envelope.operations),
            "model": result.trace.model,
        },
    )
    return result.model_dump(mode="json")


@router.post("/api/v1/graphs/{graph_id}/propose/stream")
def propose_graph_changes_stream(
    graph_id: str,
    request: ProposalGenerateRequest,
    repository: GraphRepository = Depends(get_repository),
    planner: GeminiPlanner = Depends(get_planner),
) -> StreamingResponse:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc

    def event_stream():
        try:
            result_payload: dict | None = None
            for event in planner.stream_proposal(graph, request):
                if event.get("type") == "result":
                    result_payload = event.get("result") if isinstance(event.get("result"), dict) else None
                yield json.dumps(event, ensure_ascii=False) + "\n"
            if result_payload:
                repository.append_event(
                    "graph.proposal.generated",
                    {
                        "graph_id": graph_id,
                        "mode": request.mode,
                        "summary": ((result_payload.get("display") or {}).get("summary") or ""),
                        "operation_count": len(((result_payload.get("proposal_envelope") or {}).get("operations") or [])),
                        "model": (((result_payload.get("trace") or {}).get("model")) or ""),
                    },
                )
        except GeminiPlannerError as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.post("/api/v1/graphs/{graph_id}/topics/{topic_id}/quiz/start")
def start_topic_quiz(
    graph_id: str,
    topic_id: str,
    request: QuizStartRequest,
    repository: GraphRepository = Depends(get_repository),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    existing_session = repository.latest_quiz_session_for_topic(graph_id, topic_id)
    if existing_session is not None:
        public_session = TopicQuizSessionPublic(
            session_id=existing_session.session_id,
            graph_id=existing_session.graph_id,
            topic_id=existing_session.topic_id,
            created_at=existing_session.created_at,
            question_count=existing_session.question_count,
            closure_status=existing_session.closure_status,
            generator=existing_session.generator,
            questions=[
                QuizQuestionPublic(
                    id=question.id,
                    prompt=question.prompt,
                    choices=list(question.choices),
                    explanation=question.explanation,
                )
                for question in existing_session.questions
            ],
        )
        return QuizStartResponse(session=public_session).model_dump(mode="json")
    topic = next((item for item in graph.topics if item.id == topic_id), None)
    if topic is None:
        raise HTTPException(status_code=404, detail=f"topic {topic_id} not found")
    try:
        session = quiz_service.start_session(
            graph=graph,
            topic_id=topic_id,
            question_count=request.question_count or topic.quiz_policy.question_count,
            model=request.model,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"topic {topic_id} not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    repository.save_quiz_session(session)
    repository.append_event(
        "graph.quiz.started",
        {
            "graph_id": graph_id,
            "topic_id": topic_id,
            "session_id": session.session_id,
            "question_count": session.question_count,
        },
    )
    public_session = TopicQuizSessionPublic(
        session_id=session.session_id,
        graph_id=session.graph_id,
        topic_id=session.topic_id,
        created_at=session.created_at,
        question_count=session.question_count,
        closure_status=session.closure_status,
        generator=session.generator,
        questions=[
            QuizQuestionPublic(
                id=question.id,
                prompt=question.prompt,
                choices=list(question.choices),
                explanation=question.explanation,
            )
            for question in session.questions
        ],
    )
    return QuizStartResponse(session=public_session).model_dump(mode="json")


@router.post("/api/v1/graphs/{graph_id}/topics/{topic_id}/quiz/submit")
def submit_topic_quiz(
    graph_id: str,
    topic_id: str,
    request: QuizSubmitRequest,
    repository: GraphRepository = Depends(get_repository),
    quiz_service: QuizService = Depends(get_quiz_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        session = repository.quiz_session(request.session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"quiz session {request.session_id} not found") from exc
    if session.graph_id != graph_id or session.topic_id != topic_id:
        raise HTTPException(status_code=400, detail="quiz session does not match graph/topic route")

    answers = {answer.question_id: answer.choice_index for answer in request.answers}
    attempt, _, awarded_state, reviews = quiz_service.grade_session(graph, session, answers)
    workspace = repository.record_quiz_attempt(graph_id, attempt, awarded_state)
    updated_graph = next(item for item in workspace.workspace.graphs if item.graph_id == graph_id)
    closure_status = quiz_service.build_closure_status(updated_graph, topic_id)
    repository.delete_quiz_session(request.session_id)
    repository.append_event(
        "graph.quiz.submitted",
        {
            "graph_id": graph_id,
            "topic_id": topic_id,
            "session_id": request.session_id,
            "score": attempt.score,
            "passed": attempt.passed,
            "closure_awarded": attempt.closure_awarded,
        },
    )
    return QuizSubmitResponse(
        attempt=attempt,
        closure_status=closure_status,
        awarded_state=awarded_state,
        reviews=reviews,
        workspace=workspace,
    ).model_dump(mode="json") | {"workspace": _workspace_config_payload(workspace, settings)}


@router.post("/api/v1/graphs/{graph_id}/topics/{topic_id}/mark-finished")
def mark_topic_finished(
    graph_id: str,
    topic_id: str,
    repository: GraphRepository = Depends(get_repository),
    quiz_service: QuizService = Depends(get_quiz_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        workspace = repository.mark_topic_finished(graph_id, topic_id)
    except ValueError as exc:
        message = str(exc)
        raise HTTPException(status_code=404 if "not found" in message else 400, detail=message) from exc

    existing_session = repository.latest_quiz_session_for_topic(graph_id, topic_id)
    if existing_session is not None:
        repository.delete_quiz_session(existing_session.session_id)

    updated_graph = next(item for item in workspace.workspace.graphs if item.graph_id == graph_id)
    closure_status = quiz_service.build_closure_status(updated_graph, topic_id)
    attempt = next(item for item in updated_graph.quiz_attempts if item.topic_id == topic_id)
    repository.append_event(
        "graph.topic.mark_finished",
        {
            "graph_id": graph_id,
            "topic_id": topic_id,
            "score": attempt.score,
            "passed": attempt.passed,
            "closure_awarded": attempt.closure_awarded,
        },
    )
    return QuizSubmitResponse(
        attempt=attempt,
        closure_status=closure_status,
        awarded_state="solid",
        reviews=[],
        workspace=workspace,
    ).model_dump(mode="json") | {"workspace": _workspace_config_payload(workspace, settings)}


@router.post("/api/v1/graphs/{graph_id}/assistant")
def graph_study_assistant(
    graph_id: str,
    request: StudyAssistantRequest,
    repository: GraphRepository = Depends(get_repository),
    assistant: StudyAssistantService = Depends(get_study_assistant),
) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    persona_rules = repository.current().workspace.config.persona_rules
    try:
        return assistant.answer(graph, request, persona_rules=persona_rules).model_dump(mode="json")
    except StudyAssistantError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/api/v1/graphs/{graph_id}/chat")
def graph_chat_thread(graph_id: str, session_id: str | None = None, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        return repository.chat_thread(graph_id, session_id=session_id).model_dump(mode="json")
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc


@router.get("/api/v1/graphs/{graph_id}/chat/sessions")
def list_chat_sessions(graph_id: str, repository: GraphRepository = Depends(get_repository)) -> list[dict]:
    try:
        repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    return [s.model_dump(mode="json") for s in repository.list_chat_sessions(graph_id)]


class CreateSessionRequest(PydanticBaseModel):
    topic_id: str | None = None
    title: str | None = None


@router.post("/api/v1/graphs/{graph_id}/chat/sessions")
def create_chat_session(graph_id: str, body: CreateSessionRequest, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        session = repository.create_chat_session(graph_id, topic_id=body.topic_id, title=body.title)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return session.model_dump(mode="json")


@router.delete("/api/v1/graphs/{graph_id}/chat/sessions/{session_id}")
def delete_chat_session(graph_id: str, session_id: str, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        repository.delete_chat_session(graph_id, session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    except ChatSessionDeletionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/api/v1/graphs/{graph_id}/chat")
def graph_chat(
    graph_id: str,
    request: GraphChatRequest,
    repository: GraphRepository = Depends(get_repository),
    orchestrator: ChatOrchestratorService = Depends(get_chat_orchestrator),
) -> dict:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        existing_thread = repository.chat_thread(graph_id, session_id=request.session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    user_message = ChatMessage(
        role="user",
        content=request.prompt,
        hidden=request.hidden_user_message,
    )
    # For topic sessions, use the session's topic_id as context
    effective_topic_id = request.selected_topic_id or existing_thread.topic_id
    effective_request = GraphChatRequest(
        prompt=request.prompt,
        messages=[*existing_thread.messages, user_message],
        selected_topic_id=effective_topic_id,
        session_id=request.session_id,
        model=request.model,
        use_grounding=request.use_grounding,
    )
    workspace_config = repository.current().workspace.config
    persona_rules = workspace_config.persona_rules
    if not orchestrator.has_live_provider():
        raise HTTPException(status_code=503, detail="The selected AI provider is unavailable: missing API key")
    try:
        response = orchestrator.respond(graph, effective_request, persona_rules=persona_rules, workspace_config=workspace_config)
    except ChatOrchestratorError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    repository.append_chat_message(graph_id, user_message, session_id=request.session_id)
    assistant_thread = repository.append_chat_message(
        graph_id,
        ChatMessage(
            role="assistant",
            content=response.message,
            model=response.model,
            fallback_used=response.fallback_used,
            action=response.action,
            proposal=response.proposal,
        ),
        session_id=request.session_id,
    )
    response.session_id = assistant_thread.session_id
    response.graph_id = graph_id
    response.messages = assistant_thread.messages
    return response.model_dump(mode="json")


@router.post("/api/v1/graphs/{graph_id}/chat/stream")
def graph_chat_stream(
    graph_id: str,
    request: GraphChatRequest,
    repository: GraphRepository = Depends(get_repository),
    orchestrator: ChatOrchestratorService = Depends(get_chat_orchestrator),
) -> StreamingResponse:
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        existing_thread = repository.chat_thread(graph_id, session_id=request.session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    if not orchestrator.has_live_provider():
        raise HTTPException(status_code=503, detail="The selected AI provider is unavailable: missing API key")

    def event_stream():
        workspace_config = repository.current().workspace.config
        model_name = request.model or workspace_config.default_model
        persona_rules = workspace_config.persona_rules
        user_message = ChatMessage(role="user", content=request.prompt)
        user_message.hidden = request.hidden_user_message
        effective_topic_id = request.selected_topic_id or existing_thread.topic_id
        effective_request = GraphChatRequest(
            prompt=request.prompt,
            messages=[*existing_thread.messages, user_message],
            selected_topic_id=effective_topic_id,
            session_id=request.session_id,
            model=request.model,
            use_grounding=request.use_grounding,
        )

        try:
            try:
                decision = orchestrator.decide(graph, effective_request, persona_rules=persona_rules, workspace_config=workspace_config)
            except ChatOrchestratorError as exc:
                yield json.dumps({"type": "error", "detail": str(exc)}, ensure_ascii=False) + "\n"
                return

            repository.append_chat_message(graph_id, user_message, session_id=request.session_id)

            inline_quiz = None
            if decision.inline_quiz is not None:
                inline_quiz = InlineChatQuiz(
                    question=decision.inline_quiz.question,
                    choices=decision.inline_quiz.choices[:4],
                    correct_index=max(0, min(3, decision.inline_quiz.correct_index)),
                )

            assistant_thread = repository.append_chat_message(
                graph_id,
                ChatMessage(
                    role="assistant",
                    content=orchestrator.reply_for_decision(decision),
                    model=model_name,
                    action=decision.action,
                    inline_quiz=inline_quiz,
                ),
                session_id=request.session_id,
            )
            assistant_message = assistant_thread.messages[-1]
            yield json.dumps(
                {
                    "type": "assistant_message",
                    "message": assistant_message.model_dump(mode="json"),
                    "messages": [message.model_dump(mode="json") for message in assistant_thread.messages],
                },
                ensure_ascii=False,
            ) + "\n"

            if decision.action == "answer":
                return

            assistant_thread = repository.update_chat_message(
                graph_id,
                ChatMessage.model_validate(
                    {
                        **assistant_message.model_dump(mode="json"),
                        "planning_status": "Creating graph proposal",
                        "planning_error": None,
                    }
                ),
                session_id=request.session_id,
            )
            assistant_message = next(
                message
                for message in assistant_thread.messages
                if message.id == assistant_message.id
            )
            yield json.dumps(
                {
                    "type": "planning_status",
                    "message_id": assistant_message.id,
                    "label": "Creating graph proposal",
                },
                ensure_ascii=False,
            ) + "\n"

            proposal_request = orchestrator.proposal_request_for_decision(decision, effective_request, model_name=model_name)
            try:
                result_payload = orchestrator.stream_proposal_result(graph, proposal_request)
            except Exception as exc:
                updated_thread = repository.update_chat_message(
                    graph_id,
                    ChatMessage.model_validate(
                        {
                            **assistant_message.model_dump(mode="json"),
                            "planning_status": None,
                            "planning_error": f"proposal generation failed: {exc}",
                        }
                    ),
                    session_id=request.session_id,
                )
                assistant_message = next(
                    message
                    for message in updated_thread.messages
                    if message.id == assistant_message.id
                )
                yield json.dumps(
                    {
                        "type": "planning_error",
                        "message_id": assistant_message.id,
                        "detail": f"proposal generation failed: {exc}",
                    },
                    ensure_ascii=False,
                ) + "\n"
                return

            updated_thread = repository.update_chat_message(
                graph_id,
                ChatMessage.model_validate(
                    {
                        **assistant_message.model_dump(mode="json"),
                        "planning_status": None,
                        "planning_error": None,
                        "proposal": result_payload,
                    }
                ),
                session_id=request.session_id,
            )
            yield json.dumps(
                {
                    "type": "proposal_ready",
                    "message_id": assistant_message.id,
                    "message": next(
                        message.model_dump(mode="json")
                        for message in updated_thread.messages
                        if message.id == assistant_message.id
                    ),
                    "messages": [message.model_dump(mode="json") for message in updated_thread.messages],
                },
                ensure_ascii=False,
            ) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.post("/api/v1/graphs/{graph_id}/normalize")
def normalize_graph_proposal(
    graph_id: str,
    envelope: GraphProposalEnvelope,
    repository: GraphRepository = Depends(get_repository),
    normalizer: ProposalNormalizer = Depends(get_normalizer),
) -> dict:
    if envelope.graph_id != graph_id:
        raise HTTPException(status_code=400, detail="graph_id in route and payload must match")
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    plan = normalizer.normalize(envelope, graph=graph)
    return plan.model_dump(mode="json")


@router.post("/api/v1/graphs/{graph_id}/apply")
def apply_graph_proposal(
    graph_id: str,
    envelope: GraphProposalEnvelope,
    repository: GraphRepository = Depends(get_repository),
    normalizer: ProposalNormalizer = Depends(get_normalizer),
) -> dict:
    if envelope.graph_id != graph_id:
        raise HTTPException(status_code=400, detail="graph_id in route and payload must match")
    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    plan = normalizer.normalize(envelope, graph=graph)
    if not plan.validation.ok:
        raise HTTPException(status_code=400, detail={"errors": plan.validation.errors, "warnings": plan.validation.warnings})
    try:
        applied = repository.apply_proposal(plan.normalized_proposal)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _workspace_config_payload(applied, get_settings())


@router.post("/api/v1/graphs/{graph_id}/chat/messages/{message_id}/applied")
def mark_chat_message_applied(
    graph_id: str,
    message_id: str,
    session_id: str | None = None,
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    try:
        repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        thread = repository.chat_thread(graph_id, session_id=session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    target = next((message for message in thread.messages if message.id == message_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"chat message {message_id} not found")
    target.proposal_applied = True
    try:
        updated = repository.update_chat_message(graph_id, target, session_id=session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"chat message {message_id} not found") from exc
    return updated.model_dump(mode="json")


@router.post("/api/v1/graph/rollback/{snapshot_id}")
def rollback_graph(snapshot_id: int, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        envelope = repository.rollback_to(snapshot_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"snapshot {snapshot_id} not found") from exc
    return _workspace_config_payload(envelope, get_settings())
