from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from app.core.config import Settings
from app.models.domain import GraphChatRequest, ProposalGenerateRequest
from app.services.repository import GraphRepository


def assistant_persona_rules(workspace_config) -> str:
    base_rules = (workspace_config.persona_rules or "").strip()
    nickname = (getattr(workspace_config, "assistant_nickname", "") or "").strip()
    if not nickname:
        return base_rules
    nickname_rule = (
        f"Your nickname in this workspace is '{nickname}'. "
        "If the learner refers to you by name, respond to this nickname naturally."
    )
    return f"{nickname_rule}\n{base_rules}" if base_rules else nickname_rule


def proposal_failure_diagnostics_payload(
    *,
    graph_id: str,
    model_name: str,
    request: GraphChatRequest,
    proposal_request: ProposalGenerateRequest | None,
    exc: Exception,
) -> dict:
    compact_messages = [
        {
            "id": message.id,
            "role": message.role,
            "content": message.content,
            "hidden": message.hidden,
            "created_at": message.created_at.isoformat() if message.created_at else None,
            "model": message.model,
            "action": message.action,
            "planning_status": message.planning_status,
            "planning_error": message.planning_error,
            "proposal_applied": message.proposal_applied,
            "has_proposal": message.proposal is not None,
            "has_inline_quiz": message.inline_quiz is not None,
        }
        for message in request.messages
    ]
    return {
        "graph_id": graph_id,
        "model": model_name,
        "chat_request": {
            "prompt": request.prompt,
            "hidden_user_message": request.hidden_user_message,
            "selected_topic_id": request.selected_topic_id,
            "session_id": request.session_id,
            "model": request.model,
            "use_grounding": request.use_grounding,
            "message_count": len(request.messages),
            "messages": compact_messages,
        },
        "proposal_request": proposal_request.model_dump(mode="json") if proposal_request is not None else None,
        "error_type": exc.__class__.__name__,
        "error_message": str(exc),
        "diagnostics": getattr(exc, "diagnostics", None),
    }


def workspace_config_payload(envelope, settings: Settings) -> dict:
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


def local_workspace_surface(repository: GraphRepository) -> dict:
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


def local_user(settings: Settings) -> dict:
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


def resource_label_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    host = parsed.netloc.replace("www.", "") if parsed.netloc else ""
    path = parsed.path.rstrip("/")
    tail = path.split("/")[-1] if path else ""
    if host and tail:
        return f"{host}/{tail}"
    if host:
        return host
    return url.strip()


def normalize_resource_url(raw: str) -> str:
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
