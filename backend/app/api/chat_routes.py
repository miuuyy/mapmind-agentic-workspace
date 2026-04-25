from __future__ import annotations

import json
import traceback
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PydanticBaseModel

from app.api.deps import get_chat_orchestrator, get_repository
from app.api.route_helpers import assistant_persona_rules, proposal_failure_diagnostics_payload
from app.core.config import Settings, get_settings
from app.models.domain import ChatMessage, GraphChatRequest, InlineChatQuiz
from app.services.debug_log_service import get_debug_log_service
from app.services.repository import ChatSessionDeletionError, ChatSessionNotFoundError, GraphRepository

if TYPE_CHECKING:
    from app.services.chat_orchestrator import ChatOrchestratorService


router = APIRouter()


class CreateSessionRequest(PydanticBaseModel):
    topic_id: str | None = None
    title: str | None = None


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
    orchestrator: "ChatOrchestratorService" = Depends(get_chat_orchestrator),
    settings: Settings = Depends(get_settings),
) -> dict:
    from app.services.chat_orchestrator import ChatOrchestratorError

    try:
        graph = repository.graph(graph_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"graph {graph_id} not found") from exc
    try:
        existing_thread = repository.chat_thread(graph_id, session_id=request.session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    user_message = ChatMessage(role="user", content=request.prompt, hidden=request.hidden_user_message)
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
    persona_rules = assistant_persona_rules(workspace_config)
    if not orchestrator.has_live_provider():
        raise HTTPException(status_code=503, detail="The selected AI provider is unavailable: missing API key")
    proposal_request = None
    try:
        response = orchestrator.respond(graph, effective_request, persona_rules=persona_rules, workspace_config=workspace_config)
    except ChatOrchestratorError as exc:
        if "proposal generation failed" in str(exc):
            get_debug_log_service(settings.root_dir).log_server_error(
                title=f"POST /api/v1/graphs/{graph_id}/chat",
                message="Proposal generation failed",
                method="POST",
                path=f"/api/v1/graphs/{graph_id}/chat",
                status_code=502,
                request_payload=proposal_failure_diagnostics_payload(
                    graph_id=graph_id,
                    model_name=request.model or workspace_config.default_model,
                    request=effective_request,
                    proposal_request=proposal_request,
                    exc=exc,
                ),
                response_payload={"detail": str(exc)},
                stack=traceback.format_exc(),
                preserve_private_payload=True,
            )
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
    orchestrator: "ChatOrchestratorService" = Depends(get_chat_orchestrator),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    from app.services.chat_orchestrator import ChatOrchestratorError

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
        persona_rules = assistant_persona_rules(workspace_config)
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
            assistant_message = next(message for message in assistant_thread.messages if message.id == assistant_message.id)
            yield json.dumps(
                {"type": "planning_status", "message_id": assistant_message.id, "label": "Creating graph proposal"},
                ensure_ascii=False,
            ) + "\n"

            proposal_request = orchestrator.proposal_request_for_decision(decision, effective_request, model_name=model_name)
            try:
                result_payload = orchestrator.stream_proposal_result(graph, proposal_request)
            except Exception as exc:
                get_debug_log_service(settings.root_dir).log_server_error(
                    title=f"POST /api/v1/graphs/{graph_id}/chat/stream",
                    message="Proposal generation failed",
                    method="POST",
                    path=f"/api/v1/graphs/{graph_id}/chat/stream",
                    status_code=200,
                    request_payload=proposal_failure_diagnostics_payload(
                        graph_id=graph_id,
                        model_name=model_name,
                        request=effective_request,
                        proposal_request=proposal_request,
                        exc=exc,
                    ),
                    response_payload={"detail": f"proposal generation failed: {exc}"},
                    stack=traceback.format_exc(),
                    preserve_private_payload=True,
                )
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
                assistant_message = next(message for message in updated_thread.messages if message.id == assistant_message.id)
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


@router.post("/api/v1/graphs/{graph_id}/chat/messages/{message_id}/applied")
def mark_chat_message_applied(
    graph_id: str,
    message_id: str,
    session_id: str | None = None,
    repository: GraphRepository = Depends(get_repository),
) -> dict:
    try:
        thread = repository.chat_thread(graph_id, session_id=session_id)
    except ChatSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"chat session {exc.session_id} not found") from exc
    target = next((message for message in thread.messages if message.id == message_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"message {message_id} not found")
    target.proposal_applied = True
    updated = repository.update_chat_message(graph_id, target, session_id=session_id)
    return updated.model_dump(mode="json")
