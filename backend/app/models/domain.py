from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.llm.catalog import provider_default_model, provider_model_options, supported_provider_ids
from app.llm.contracts import OrchestratorAction


TopicState = Literal["not_started", "learning", "shaky", "solid", "mastered", "needs_review"]
EdgeRelation = Literal["requires", "supports", "bridges", "extends", "reviews"]
GraphLanguage = Literal["en", "uk", "ru"]
ThinkingMode = Literal["low", "default", "custom"]
MemoryMode = Literal["balanced", "max", "custom"]
OperationType = Literal[
    "upsert_topic",
    "remove_topic",
    "upsert_edge",
    "remove_edge",
    "upsert_zone",
    "set_mastery",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ResourceLink(BaseModel):
    id: str
    label: str
    url: str
    kind: str = "reference"


class Artifact(BaseModel):
    id: str
    title: str
    kind: str
    body: str
    created_at: datetime = Field(default_factory=utc_now)


class QuizPolicy(BaseModel):
    question_count: int = 12
    pass_threshold: float = 0.75


THINKING_MODE_TOKEN_PRESETS: dict[ThinkingMode, dict[str, int]] = {
    "low": {
        "planner_max_output_tokens": 90000,
        "planner_thinking_budget": 2048,
        "orchestrator_max_output_tokens": 8192,
        "quiz_max_output_tokens": 3072,
        "assistant_max_output_tokens": 700,
    },
    "default": {
        "planner_max_output_tokens": 200000,
        "planner_thinking_budget": 12288,
        "orchestrator_max_output_tokens": 16384,
        "quiz_max_output_tokens": 4096,
        "assistant_max_output_tokens": 800,
    },
    "custom": {
        "planner_max_output_tokens": 200000,
        "planner_thinking_budget": 12288,
        "orchestrator_max_output_tokens": 16384,
        "quiz_max_output_tokens": 4096,
        "assistant_max_output_tokens": 800,
    },
}

MEMORY_MODE_PRESETS: dict[MemoryMode, dict[str, int | bool]] = {
    "balanced": {
        "memory_history_message_limit": 32,
        "memory_include_graph_context": True,
        "memory_include_progress_context": True,
        "memory_include_quiz_context": True,
        "memory_include_frontier_context": True,
        "memory_include_selected_topic_context": True,
    },
    "max": {
        "memory_history_message_limit": 64,
        "memory_include_graph_context": True,
        "memory_include_progress_context": True,
        "memory_include_quiz_context": True,
        "memory_include_frontier_context": True,
        "memory_include_selected_topic_context": True,
    },
    "custom": {
        "memory_history_message_limit": 32,
        "memory_include_graph_context": True,
        "memory_include_progress_context": True,
        "memory_include_quiz_context": True,
        "memory_include_frontier_context": True,
        "memory_include_selected_topic_context": True,
    },
}

LEGACY_MAX_THINKING_PRESET: dict[str, int] = {
    "planner_max_output_tokens": 360000,
    "planner_thinking_budget": 32768,
    "orchestrator_max_output_tokens": 24576,
    "quiz_max_output_tokens": 6144,
    "assistant_max_output_tokens": 1200,
}

LEGACY_COMPACT_MEMORY_PRESET: dict[str, int | bool] = {
    "memory_history_message_limit": 12,
    "memory_include_graph_context": False,
    "memory_include_progress_context": True,
    "memory_include_quiz_context": False,
    "memory_include_frontier_context": True,
    "memory_include_selected_topic_context": True,
}


def thinking_mode_prompt_guidance(mode: ThinkingMode) -> str:
    if mode == "low":
        return (
            "Thinking mode: Low. Be conservative with graph growth. "
            "If the current graph already covers the request well enough, prefer leaving it unchanged. "
            "If expansion is necessary, add only a small set of essential topics."
        )
    if mode == "custom":
        return (
            "Thinking mode: Custom. Use the manually assigned token budgets and thinking budget "
            "from workspace configuration instead of a preset."
        )
    return (
        "Thinking mode: Default. Expand with balanced scope. "
        "Add enough topics to make the path usable and coherent without overbuilding the graph."
    )


class QuizAttempt(BaseModel):
    id: str
    topic_id: str
    passed: bool
    score: float
    question_count: int
    closure_awarded: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    missed_questions: list[str] = Field(default_factory=list)
    fail_count: int = 0


class QuizQuestion(BaseModel):
    id: str
    prompt: str
    choices: list[str] = Field(default_factory=list)
    correct_choice_index: int
    explanation: str = ""


class QuizQuestionSet(BaseModel):
    questions: list[QuizQuestion] = Field(default_factory=list)


class QuizAnswer(BaseModel):
    question_id: str
    choice_index: int


class TopicClosureStatus(BaseModel):
    topic_id: str
    prerequisite_topic_ids: list[str] = Field(default_factory=list)
    blocked_prerequisite_ids: list[str] = Field(default_factory=list)
    can_award_completion: bool = True
    latest_attempt: QuizAttempt | None = None


class TopicQuizSession(BaseModel):
    session_id: str
    graph_id: str
    topic_id: str
    created_at: datetime = Field(default_factory=utc_now)
    question_count: int
    questions: list[QuizQuestion] = Field(default_factory=list)
    closure_status: TopicClosureStatus
    generator: str = "heuristic"


class QuizQuestionPublic(BaseModel):
    id: str
    prompt: str
    choices: list[str] = Field(default_factory=list)
    explanation: str = ""


class TopicQuizSessionPublic(BaseModel):
    session_id: str
    graph_id: str
    topic_id: str
    created_at: datetime = Field(default_factory=utc_now)
    question_count: int
    questions: list[QuizQuestionPublic] = Field(default_factory=list)
    closure_status: TopicClosureStatus
    generator: str = "heuristic"


class QuizQuestionReview(BaseModel):
    question_id: str
    prompt: str
    selected_choice: str | None = None
    correct_choice: str
    was_correct: bool
    explanation: str = ""


class QuizStartRequest(BaseModel):
    question_count: int | None = None
    model: str | None = None


class QuizStartResponse(BaseModel):
    session: TopicQuizSessionPublic


class QuizSubmitRequest(BaseModel):
    session_id: str
    answers: list[QuizAnswer] = Field(default_factory=list)


class QuizSubmitResponse(BaseModel):
    attempt: QuizAttempt
    closure_status: TopicClosureStatus
    awarded_state: TopicState | None = None
    reviews: list[QuizQuestionReview] = Field(default_factory=list)
    workspace: "WorkspaceEnvelope"


class Topic(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    difficulty: float = 0.0
    estimated_minutes: int = 0
    level: int = 0
    state: TopicState = "not_started"
    zones: list[str] = Field(default_factory=list)
    resources: list[ResourceLink] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    quiz_policy: QuizPolicy = Field(default_factory=QuizPolicy)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Edge(BaseModel):
    id: str
    source_topic_id: str
    target_topic_id: str
    relation: EdgeRelation = "requires"
    rationale: str = ""
    weight: float = 1.0


class Zone(BaseModel):
    id: str
    title: str
    kind: str
    color: str
    intensity: float = 0.5
    topic_ids: list[str] = Field(default_factory=list)


class StudyGraph(BaseModel):
    graph_id: str
    subject: str
    title: str
    language: GraphLanguage = "en"
    version: int = 1
    generated_at: datetime = Field(default_factory=utc_now)
    topics: list[Topic] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    zones: list[Zone] = Field(default_factory=list)
    quiz_attempts: list[QuizAttempt] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkspaceConfig(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_modes(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if normalized.get("thinking_mode") == "max":
            normalized["thinking_mode"] = "custom"
            for field_name, value in LEGACY_MAX_THINKING_PRESET.items():
                normalized.setdefault(field_name, value)
        if normalized.get("memory_mode") == "compact":
            normalized["memory_mode"] = "custom"
            for field_name, value in LEGACY_COMPACT_MEMORY_PRESET.items():
                normalized.setdefault(field_name, value)
        return normalized

    ai_provider: str = "gemini"
    default_model: str = provider_default_model("gemini")
    model_options: list[str] = Field(default_factory=lambda: provider_model_options("gemini"))
    provider_options: list[str] = Field(default_factory=supported_provider_ids)
    ui_language: str = "en"
    canonical_graph_language: str = "en"
    use_google_search_grounding: bool = True
    disable_idle_animations: bool = False
    thinking_mode: ThinkingMode = "default"
    memory_mode: MemoryMode = "balanced"
    assistant_nickname: str = ""
    persona_rules: str = ""
    quiz_question_count: int = 12
    pass_threshold: float = 0.75
    enable_closure_tests: bool = True
    debug_mode_enabled: bool = False
    memory_history_message_limit: int = int(MEMORY_MODE_PRESETS["balanced"]["memory_history_message_limit"])
    memory_include_graph_context: bool = bool(MEMORY_MODE_PRESETS["balanced"]["memory_include_graph_context"])
    memory_include_progress_context: bool = bool(MEMORY_MODE_PRESETS["balanced"]["memory_include_progress_context"])
    memory_include_quiz_context: bool = bool(MEMORY_MODE_PRESETS["balanced"]["memory_include_quiz_context"])
    memory_include_frontier_context: bool = bool(MEMORY_MODE_PRESETS["balanced"]["memory_include_frontier_context"])
    memory_include_selected_topic_context: bool = bool(MEMORY_MODE_PRESETS["balanced"]["memory_include_selected_topic_context"])
    allow_explore_without_closure: bool = True
    require_prerequisite_closure_for_completion: bool = True
    planner_max_output_tokens: int = THINKING_MODE_TOKEN_PRESETS["default"]["planner_max_output_tokens"]
    orchestrator_max_output_tokens: int = THINKING_MODE_TOKEN_PRESETS["default"]["orchestrator_max_output_tokens"]
    quiz_max_output_tokens: int = THINKING_MODE_TOKEN_PRESETS["default"]["quiz_max_output_tokens"]
    assistant_max_output_tokens: int = THINKING_MODE_TOKEN_PRESETS["default"]["assistant_max_output_tokens"]
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    planner_thinking_budget: int = THINKING_MODE_TOKEN_PRESETS["default"]["planner_thinking_budget"]


class WorkspaceDocument(BaseModel):
    workspace_id: str = "default"
    title: str = "MapMind Workspace"
    active_graph_id: str | None = None
    config: WorkspaceConfig = Field(default_factory=WorkspaceConfig)
    graphs: list[StudyGraph] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphSummary(BaseModel):
    graph_id: str
    subject: str
    title: str
    topic_count: int
    edge_count: int
    zone_count: int
    version: int


class CreateGraphRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    subject: str = Field(min_length=1, max_length=120)
    language: GraphLanguage = "en"
    description: str = Field(default="", max_length=2000)


class UpdateWorkspaceConfigRequest(BaseModel):
    ai_provider: str | None = None
    default_model: str | None = None
    use_google_search_grounding: bool | None = None
    disable_idle_animations: bool | None = None
    thinking_mode: ThinkingMode | None = None
    memory_mode: MemoryMode | None = None
    assistant_nickname: str | None = None
    persona_rules: str | None = None
    quiz_question_count: int | None = None
    pass_threshold: float | None = None
    enable_closure_tests: bool | None = None
    debug_mode_enabled: bool | None = None
    memory_history_message_limit: int | None = None
    memory_include_graph_context: bool | None = None
    memory_include_progress_context: bool | None = None
    memory_include_quiz_context: bool | None = None
    memory_include_frontier_context: bool | None = None
    memory_include_selected_topic_context: bool | None = None
    planner_max_output_tokens: int | None = None
    orchestrator_max_output_tokens: int | None = None
    quiz_max_output_tokens: int | None = None
    assistant_max_output_tokens: int | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    planner_thinking_budget: int | None = None


class StudyAssistantRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    selected_topic_id: str | None = None
    model: str | None = None
    use_grounding: bool = True


class StudyAssistantResponse(BaseModel):
    message: str
    model: str
    fallback_used: bool = False


ChatRole = Literal["user", "assistant"]


class InlineChatQuiz(BaseModel):
    question: str
    choices: list[str]  # exactly 4
    correct_index: int  # 0-3
    answered_index: int | None = None


class ChatMessage(BaseModel):
    id: str | None = None
    role: ChatRole
    content: str
    hidden: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    model: str | None = None
    fallback_used: bool = False
    action: OrchestratorAction | None = None
    planning_status: str | None = None
    planning_error: str | None = None
    proposal_applied: bool = False
    proposal: "ProposalGenerateResponse | None" = None
    inline_quiz: InlineChatQuiz | None = None


class GraphChatThread(BaseModel):
    session_id: str
    graph_id: str
    topic_id: str | None = None
    title: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatSessionSummary(BaseModel):
    session_id: str
    graph_id: str
    topic_id: str | None = None
    title: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class GraphChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    messages: list[ChatMessage] = Field(default_factory=list)
    hidden_user_message: bool = False
    selected_topic_id: str | None = None
    session_id: str | None = None
    model: str | None = None
    use_grounding: bool = True


class GraphChatResponse(BaseModel):
    session_id: str
    graph_id: str
    message: str
    model: str
    fallback_used: bool = False
    action: OrchestratorAction = "answer"
    proposal: "ProposalGenerateResponse | None" = None
    messages: list[ChatMessage] = Field(default_factory=list)


class GraphAssessmentCard(BaseModel):
    label: str
    value: str
    tone: Literal["neutral", "good", "warn"]
    rationale: str = ""


class GraphAssessment(BaseModel):
    graph_id: str
    cards: list[GraphAssessmentCard] = Field(default_factory=list)


class SourceLink(BaseModel):
    label: str
    url: str


class SourceTopicSeed(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)
    estimated_minutes: int | None = None
    testing_notes: str = Field(default="", max_length=4000)
    links: list[SourceLink] = Field(default_factory=list)


ProposalMode = Literal["ingest_topics", "expand_goal"]
ProtocolKind = Literal["graph_proposal", "apply_plan", "quiz_closure", "rollback"]
ImpactLevel = Literal["low", "medium", "high"]
ProposalStatus = Literal["proposed", "reviewed", "rejected", "applied"]
EntityKind = Literal["topic", "edge", "zone", "mastery"]


class ProposalGenerateRequest(BaseModel):
    mode: ProposalMode = "ingest_topics"
    raw_text: str = Field(default="", max_length=120000)
    target_goal: str = Field(default="", max_length=4000)
    instructions: str = Field(default="", max_length=8000)
    selected_topic_id: str | None = None
    source_items: list[SourceTopicSeed] = Field(default_factory=list)
    use_grounding: bool = True
    model: str | None = None


class ProposalTopic(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    difficulty: float = 0.0
    estimated_minutes: int = 0
    level: int = 0
    state: TopicState = "not_started"
    zones: list[str] = Field(default_factory=list)
    resources: list[ResourceLink] = Field(default_factory=list)


class ProposalEdge(BaseModel):
    id: str
    source_topic_id: str
    target_topic_id: str
    relation: EdgeRelation = "requires"
    rationale: str = ""
    weight: float = 1.0


class ProposalZone(BaseModel):
    id: str
    title: str
    kind: str
    color: str
    intensity: float = 0.5
    topic_ids: list[str] = Field(default_factory=list)


class ProposalIntent(BaseModel):
    user_prompt: str = ""
    target_goal: str = ""
    instructions: str = ""


class ProposalSourceBundle(BaseModel):
    raw_text: str = ""
    source_items: list[SourceTopicSeed] = Field(default_factory=list)
    grounding_enabled: bool = True


class ProposalOpenQuestion(BaseModel):
    id: str
    kind: str
    message: str
    impact: ImpactLevel = "medium"
    suggested_resolution: str = ""


class ProposalProvenance(BaseModel):
    model: str = ""
    grounding_used: bool = False
    generated_at: datetime = Field(default_factory=utc_now)
    search_queries: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)


class GraphOperation(BaseModel):
    op_id: str
    op: OperationType
    entity_kind: EntityKind
    status: ProposalStatus = "proposed"
    depends_on: list[str] = Field(default_factory=list)
    rationale: str = ""
    topic_id: str | None = None
    edge_id: str | None = None
    zone_id: str | None = None
    state: TopicState | None = None
    topic: ProposalTopic | None = None
    edge: ProposalEdge | None = None
    zone: ProposalZone | None = None


class PatchOperation(BaseModel):
    op: OperationType
    topic_id: str | None = None
    edge_id: str | None = None
    zone_id: str | None = None
    state: TopicState | None = None
    topic: ProposalTopic | None = None
    edge: ProposalEdge | None = None
    zone: ProposalZone | None = None


class GraphProposal(BaseModel):
    graph_id: str
    user_prompt: str
    summary: str
    assistant_message: str
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    operations: list[PatchOperation] = Field(default_factory=list)


class GraphProposalEnvelope(BaseModel):
    protocol_version: str = "2.0"
    kind: ProtocolKind = "graph_proposal"
    workspace_id: str = "default"
    graph_id: str
    proposal_id: str = ""
    mode: ProposalMode
    intent: ProposalIntent = Field(default_factory=ProposalIntent)
    source_bundle: ProposalSourceBundle = Field(default_factory=ProposalSourceBundle)
    summary: str = ""
    assistant_message: str = ""
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    open_questions: list[ProposalOpenQuestion] = Field(default_factory=list)
    operations: list[GraphOperation] = Field(default_factory=list)
    provenance: ProposalProvenance = Field(default_factory=ProposalProvenance)


class PatchGroup(BaseModel):
    group_id: str
    label: str
    operations: list[GraphOperation] = Field(default_factory=list)


class ApplyPreview(BaseModel):
    topic_add_count: int = 0
    edge_add_count: int = 0
    zone_add_count: int = 0
    zone_update_count: int = 0
    mastery_update_count: int = 0


class ApplyValidation(BaseModel):
    ok: bool = True
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ApplyPlanEnvelope(BaseModel):
    protocol_version: str = "2.0"
    kind: ProtocolKind = "apply_plan"
    proposal_id: str
    graph_id: str
    validation: ApplyValidation
    normalized_proposal: GraphProposal
    patch_groups: list[PatchGroup] = Field(default_factory=list)
    preview: ApplyPreview


class ProposalTrace(BaseModel):
    model: str
    mode: ProposalMode
    used_grounding: bool
    raw_text_present: bool
    source_item_count: int
    usage_metadata: dict[str, Any] = Field(default_factory=dict)


class ProposalDisplay(BaseModel):
    summary: str
    highlights: list[str] = Field(default_factory=list)


class ProposalGenerateResponse(BaseModel):
    proposal_envelope: GraphProposalEnvelope
    apply_plan: ApplyPlanEnvelope
    trace: ProposalTrace
    display: ProposalDisplay



class SnapshotRecord(BaseModel):
    id: int
    created_at: datetime
    source: str
    reason: str | None = None
    parent_snapshot_id: int | None = None


class WorkspaceEnvelope(BaseModel):
    snapshot: SnapshotRecord
    workspace: WorkspaceDocument
