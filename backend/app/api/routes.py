from __future__ import annotations

import json
from hashlib import sha1
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import (
    ensure_debug_logs_enabled,
    get_assessment_service,
    get_chat_orchestrator,
    get_debug_logs,
    get_normalizer,
    get_planner,
    get_quiz_service,
    get_repository,
    get_study_assistant,
)
from app.api.route_helpers import (
    assistant_persona_rules as _assistant_persona_rules,
    local_user as _local_user,
    local_workspace_surface as _local_workspace_surface,
    normalize_resource_url as _normalize_resource_url,
    proposal_failure_diagnostics_payload as _proposal_failure_diagnostics_payload,
    resource_label_from_url as _resource_label_from_url,
    workspace_config_payload as _workspace_config_payload,
)
from app.core.config import Settings, get_settings
from app.models.api import GraphExportRequest, GraphImportRequest, GraphLayoutPositionRequest, RenameGraphRequest, TopicArtifactInput, TopicResourceInput, UpdateGraphLayoutRequest
from app.models.domain import Artifact, ChatMessage, CreateGraphRequest, GraphChatRequest, GraphProposal, GraphProposalEnvelope, InlineChatQuiz, ProposalGenerateRequest, QuizQuestionPublic, QuizStartRequest, QuizStartResponse, QuizSubmitRequest, QuizSubmitResponse, ResourceLink, StudyAssistantRequest, StudyAssistantResponse, TopicQuizSessionPublic, UpdateWorkspaceConfigRequest
from app.services.debug_log_service import DebugClientLogRequest, get_debug_log_service
from app.services.proposal_normalizer import ProposalNormalizer
from app.services.repository import ChatSessionDeletionError, ChatSessionNotFoundError, GraphRepository

if TYPE_CHECKING:
    from app.services.chat_orchestrator import ChatOrchestratorService
    from app.services.proposal_planner import ProposalPlanner
    from app.services.quiz_service import QuizService
    from app.services.study_assistant import StudyAssistantService

router = APIRouter()


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
        if request.format == "mapmind_obsidian_export":
            package = repository.export_graph_to_obsidian(
                graph_id,
                title=request.title,
                include_progress=request.include_progress,
                options=request.obsidian,
            )
        else:
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
    planner: "ProposalPlanner" = Depends(get_planner),
) -> dict:
    from app.services.proposal_planner import ProposalPlannerError

    try:
        graph = repository.graph(graph_id)
        result = planner.generate_proposal(graph, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    except ProposalPlannerError as exc:
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
    planner: "ProposalPlanner" = Depends(get_planner),
) -> StreamingResponse:
    from app.services.proposal_planner import ProposalPlannerError

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
        except ProposalPlannerError as exc:
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
    quiz_service: "QuizService" = Depends(get_quiz_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    from app.services.quiz_service import QuizGenerationError

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
    except QuizGenerationError as exc:
        get_debug_log_service(settings.root_dir).log_server_error(
            title=f"POST /api/v1/graphs/{graph_id}/topics/{topic_id}/quiz/start",
            message="Closure quiz generation failed",
            method="POST",
            path=f"/api/v1/graphs/{graph_id}/topics/{topic_id}/quiz/start",
            status_code=502,
            request_payload={
                "graph_id": graph_id,
                "topic_id": topic_id,
                "requested_question_count": request.question_count,
                "requested_model": request.model,
            },
            response_payload={
                "detail": str(exc),
                "diagnostics": exc.diagnostics,
            },
            preserve_private_payload=True,
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
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
    quiz_service: "QuizService" = Depends(get_quiz_service),
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
    quiz_service: "QuizService" = Depends(get_quiz_service),
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
    assistant: "StudyAssistantService" = Depends(get_study_assistant),
) -> dict:
    from app.services.study_assistant import StudyAssistantError

    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    persona_rules = _assistant_persona_rules(repository.current().workspace.config)
    try:
        return assistant.answer(graph, request, persona_rules=persona_rules).model_dump(mode="json")
    except StudyAssistantError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc




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


@router.post("/api/v1/graph/rollback/{snapshot_id}")
def rollback_graph(snapshot_id: int, repository: GraphRepository = Depends(get_repository)) -> dict:
    try:
        envelope = repository.rollback_to(snapshot_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"snapshot {snapshot_id} not found") from exc
    return _workspace_config_payload(envelope, get_settings())


from app.api.chat_routes import router as chat_router

router.include_router(chat_router)
