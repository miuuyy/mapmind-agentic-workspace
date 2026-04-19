from __future__ import annotations

from app.llm.catalog import provider_default_model, provider_model_options, supported_provider_ids
from app.models.domain import MEMORY_MODE_PRESETS, THINKING_MODE_TOKEN_PRESETS, UpdateWorkspaceConfigRequest, WorkspaceDocument


def apply_workspace_config_update(workspace: WorkspaceDocument, request: UpdateWorkspaceConfigRequest) -> list[str]:
    reasons: list[str] = []
    provider_options = supported_provider_ids()
    workspace.config.provider_options = provider_options
    provider_changed = False

    if request.ai_provider is not None:
        provider_id = request.ai_provider.strip().lower()
        if provider_id not in provider_options:
            raise ValueError(f"unsupported provider {request.ai_provider}")
        workspace.config.ai_provider = provider_id
        workspace.config.model_options = provider_model_options(provider_id)
        provider_changed = True
        reasons.append(f"ai provider {provider_id}")

    if request.default_model is not None:
        model_options = provider_model_options(workspace.config.ai_provider)
        workspace.config.model_options = model_options
        normalized_model = request.default_model.strip()
        if not normalized_model:
            raise ValueError("default_model cannot be empty")
        workspace.config.default_model = normalized_model
        reasons.append(f"default model {request.default_model}")
    elif provider_changed:
        model_options = provider_model_options(workspace.config.ai_provider)
        workspace.config.model_options = model_options
        if workspace.config.default_model not in model_options:
            workspace.config.default_model = provider_default_model(workspace.config.ai_provider)
            reasons.append(f"default model {workspace.config.default_model}")

    if request.use_google_search_grounding is not None:
        workspace.config.use_google_search_grounding = request.use_google_search_grounding
        reasons.append("google grounding on" if request.use_google_search_grounding else "google grounding off")

    if request.disable_idle_animations is not None:
        workspace.config.disable_idle_animations = request.disable_idle_animations
        reasons.append("idle animations disabled" if request.disable_idle_animations else "idle animations enabled")

    if request.thinking_mode is not None:
        workspace.config.thinking_mode = request.thinking_mode
        if request.thinking_mode != "custom":
            presets = THINKING_MODE_TOKEN_PRESETS[request.thinking_mode]
            workspace.config.planner_max_output_tokens = presets["planner_max_output_tokens"]
            workspace.config.planner_thinking_budget = presets["planner_thinking_budget"]
            workspace.config.orchestrator_max_output_tokens = presets["orchestrator_max_output_tokens"]
            workspace.config.quiz_max_output_tokens = presets["quiz_max_output_tokens"]
            workspace.config.assistant_max_output_tokens = presets["assistant_max_output_tokens"]
        reasons.append(f"thinking mode {request.thinking_mode}")

    if request.memory_mode is not None:
        workspace.config.memory_mode = request.memory_mode
        if request.memory_mode != "custom":
            memory_preset = MEMORY_MODE_PRESETS[request.memory_mode]
            workspace.config.memory_history_message_limit = int(memory_preset["memory_history_message_limit"])
            workspace.config.memory_include_graph_context = bool(memory_preset["memory_include_graph_context"])
            workspace.config.memory_include_progress_context = bool(memory_preset["memory_include_progress_context"])
            workspace.config.memory_include_quiz_context = bool(memory_preset["memory_include_quiz_context"])
            workspace.config.memory_include_frontier_context = bool(memory_preset["memory_include_frontier_context"])
            workspace.config.memory_include_selected_topic_context = bool(memory_preset["memory_include_selected_topic_context"])
        reasons.append(f"memory mode {request.memory_mode}")

    if request.assistant_nickname is not None:
        workspace.config.assistant_nickname = request.assistant_nickname.strip()
        reasons.append("assistant nickname updated")

    if request.persona_rules is not None:
        workspace.config.persona_rules = request.persona_rules.strip()
        reasons.append("persona rules updated")

    if request.quiz_question_count is not None:
        if request.quiz_question_count < 6 or request.quiz_question_count > 12:
            raise ValueError("quiz_question_count must be between 6 and 12")
        workspace.config.quiz_question_count = request.quiz_question_count
        reasons.append(f"quiz question count {request.quiz_question_count}")

    if request.pass_threshold is not None:
        if request.pass_threshold <= 0 or request.pass_threshold > 1:
            raise ValueError("pass_threshold must be between 0 and 1")
        workspace.config.pass_threshold = request.pass_threshold
        reasons.append(f"pass threshold {request.pass_threshold:.3f}")

    if request.enable_closure_tests is not None:
        workspace.config.enable_closure_tests = request.enable_closure_tests
        reasons.append("closure tests enabled" if request.enable_closure_tests else "closure tests disabled")

    if request.debug_mode_enabled is not None:
        workspace.config.debug_mode_enabled = request.debug_mode_enabled
        reasons.append("debug mode enabled" if request.debug_mode_enabled else "debug mode disabled")

    memory_fields = [
        ("memory_history_message_limit", request.memory_history_message_limit),
        ("memory_include_graph_context", request.memory_include_graph_context),
        ("memory_include_progress_context", request.memory_include_progress_context),
        ("memory_include_quiz_context", request.memory_include_quiz_context),
        ("memory_include_frontier_context", request.memory_include_frontier_context),
        ("memory_include_selected_topic_context", request.memory_include_selected_topic_context),
    ]
    for field_name, value in memory_fields:
        if value is None:
            continue
        if field_name == "memory_history_message_limit":
            if value < 4 or value > 120:
                raise ValueError("memory_history_message_limit must be between 4 and 120")
            setattr(workspace.config, field_name, int(value))
        else:
            setattr(workspace.config, field_name, bool(value))
        reasons.append(f"{field_name} updated")

    token_limit_fields = [
        ("planner_max_output_tokens", request.planner_max_output_tokens),
        ("planner_thinking_budget", request.planner_thinking_budget),
        ("orchestrator_max_output_tokens", request.orchestrator_max_output_tokens),
        ("quiz_max_output_tokens", request.quiz_max_output_tokens),
        ("assistant_max_output_tokens", request.assistant_max_output_tokens),
    ]
    for field_name, value in token_limit_fields:
        if value is None:
            continue
        if value < 100:
            raise ValueError(f"{field_name} must be at least 100")
        setattr(workspace.config, field_name, value)
        reasons.append(f"{field_name}={value}")

    if request.gemini_api_key is not None:
        workspace.config.gemini_api_key = request.gemini_api_key.strip() or None
        reasons.append("gemini api key updated")

    if request.openai_api_key is not None:
        workspace.config.openai_api_key = request.openai_api_key.strip() or None
        reasons.append("openai api key updated")

    if request.openai_base_url is not None:
        normalized = request.openai_base_url.strip().rstrip("/")
        if not normalized:
            raise ValueError("openai_base_url cannot be empty")
        workspace.config.openai_base_url = normalized
        reasons.append("openai base url updated")

    if not reasons:
        raise ValueError("no config fields provided")

    return reasons
