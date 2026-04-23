export type TopicState =
  | "not_started"
  | "learning"
  | "shaky"
  | "solid"
  | "mastered"
  | "needs_review";

export type ResourceLink = {
  id: string;
  label: string;
  url: string;
  kind: string;
};

export type Artifact = {
  id: string;
  title: string;
  kind: string;
  body: string;
  created_at: string;
};

export type Topic = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: number;
  estimated_minutes: number;
  level: number;
  state: TopicState;
  zones: string[];
  resources: ResourceLink[];
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
};

export type QuizAttempt = {
  id: string;
  topic_id: string;
  passed: boolean;
  score: number;
  question_count: number;
  closure_awarded: boolean;
  created_at: string;
  missed_questions: string[];
  fail_count: number;
};

export type Edge = {
  id: string;
  source_topic_id: string;
  target_topic_id: string;
  relation: string;
  rationale: string;
};

export type Zone = {
  id: string;
  title: string;
  kind: string;
  color: string;
  intensity: number;
  topic_ids: string[];
};

export type GraphEnvelope = {
  graph_id: string;
  subject: string;
  title: string;
  language: "en" | "uk" | "ru";
  version: number;
  topics: Topic[];
  edges: Edge[];
  zones: Zone[];
  quiz_attempts: QuizAttempt[];
  metadata: Record<string, unknown>;
};

export type TopicClosureStatus = {
  topic_id: string;
  prerequisite_topic_ids: string[];
  blocked_prerequisite_ids: string[];
  can_award_completion: boolean;
  latest_attempt: QuizAttempt | null;
};

export type TopicQuizSession = {
  session_id: string;
  graph_id: string;
  topic_id: string;
  created_at: string;
  question_count: number;
  generator: string;
  closure_status: TopicClosureStatus;
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    explanation: string;
  }>;
};

export type QuizQuestionReview = {
  question_id: string;
  prompt: string;
  selected_choice: string | null;
  correct_choice: string;
  was_correct: boolean;
  explanation: string;
};

export type QuizStartResponse = {
  session: TopicQuizSession;
};

export type QuizSubmitResponse = {
  attempt: QuizAttempt;
  closure_status: TopicClosureStatus;
  awarded_state: TopicState | null;
  reviews: QuizQuestionReview[];
  workspace: WorkspaceEnvelope;
};

export type CreateGraphRequest = {
  title: string;
  subject: string;
  language: "en" | "uk" | "ru";
  description: string;
};

export type StudyAssistantRequest = {
  prompt: string;
  selected_topic_id?: string | null;
  model?: string | null;
  use_grounding: boolean;
};

export type StudyAssistantResponse = {
  message: string;
  model: string;
  fallback_used: boolean;
};

export type InlineChatQuiz = {
  question: string;
  choices: string[];
  correct_index: number;
  answered_index?: number | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
  created_at: string;
  model?: string | null;
  fallback_used?: boolean;
  action?: "answer" | "propose_ingest" | "propose_expand" | null;
  planning_status?: string | null;
  planning_error?: string | null;
  proposal_applied?: boolean;
  proposal?: ProposalGenerateResponse | null;
  inline_quiz?: InlineChatQuiz | null;
};

export type GraphChatThread = {
  session_id: string;
  graph_id: string;
  topic_id?: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
};

export type ChatSessionSummary = {
  session_id: string;
  graph_id: string;
  topic_id?: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type GraphChatRequest = {
  prompt: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    hidden?: boolean;
    created_at: string;
  }>;
  hidden_user_message?: boolean;
  selected_topic_id?: string | null;
  session_id?: string | null;
  model?: string | null;
  use_grounding: boolean;
};

export type GraphChatResponse = {
  session_id: string;
  graph_id: string;
  message: string;
  model: string;
  fallback_used: boolean;
  action: "answer" | "propose_ingest" | "propose_expand";
  proposal?: ProposalGenerateResponse | null;
  messages: ChatMessage[];
};

export type GraphChatStreamEvent =
  | { type: "assistant_message"; message?: ChatMessage; messages?: ChatMessage[] }
  | { type: "planning_status"; message_id: string; label: string }
  | { type: "proposal_ready"; message_id: string; message?: ChatMessage; messages?: ChatMessage[] }
  | { type: "planning_error"; message_id: string; detail: string }
  | { type: "error"; detail: string };

export type GraphAssessment = {
  graph_id: string;
  cards: Array<{
    label: string;
    value: string;
    tone: "neutral" | "good" | "warn";
    rationale: string;
  }>;
};

export type ProposalMode = "ingest_topics" | "expand_goal";
export type ProposalStatus = "proposed" | "reviewed" | "rejected" | "applied";

export type ProposalGenerateRequest = {
  mode: ProposalMode;
  raw_text: string;
  target_goal: string;
  instructions: string;
  source_items: Array<{
    title: string;
    description: string;
    estimated_minutes?: number | null;
    testing_notes: string;
    links: Array<{ label: string; url: string }>;
  }>;
  use_grounding: boolean;
  model?: string | null;
};

export type GraphProposal = {
  graph_id: string;
  user_prompt: string;
  summary: string;
  assistant_message: string;
  warnings: string[];
  assumptions: string[];
  operations: Array<{
    op: string;
    topic_id?: string | null;
    edge_id?: string | null;
    zone_id?: string | null;
    state?: TopicState | null;
    topic?: Topic | null;
    edge?: Edge | null;
    zone?: Zone | null;
  }>;
};

export type GraphOperation = {
  op_id: string;
  op: string;
  entity_kind: "topic" | "edge" | "zone" | "mastery";
  status: ProposalStatus;
  depends_on: string[];
  rationale: string;
  topic_id?: string | null;
  edge_id?: string | null;
  zone_id?: string | null;
  state?: TopicState | null;
  topic?: {
    id: string;
    title: string;
    slug: string;
    description: string;
    difficulty: number;
    estimated_minutes: number;
    level: number;
    state: TopicState;
    zones: string[];
    resources: Array<{ label: string; url: string; kind?: string }>;
  } | null;
  edge?: Edge | null;
  zone?: Zone | null;
};

export type GraphProposalEnvelope = {
  protocol_version: string;
  kind: "graph_proposal";
  workspace_id: string;
  graph_id: string;
  proposal_id: string;
  mode: ProposalMode;
  intent: {
    user_prompt: string;
    target_goal: string;
    instructions: string;
  };
  source_bundle: {
    raw_text: string;
    source_items: Array<unknown>;
    grounding_enabled: boolean;
  };
  summary: string;
  assistant_message: string;
  assumptions: string[];
  warnings: string[];
  open_questions: Array<{
    id: string;
    kind: string;
    message: string;
    impact: "low" | "medium" | "high";
    suggested_resolution: string;
  }>;
  operations: GraphOperation[];
  provenance: {
    model: string;
    grounding_used: boolean;
    generated_at: string;
    search_queries: string[];
    source_urls: string[];
  };
};

export type ApplyPlanEnvelope = {
  protocol_version: string;
  kind: "apply_plan";
  proposal_id: string;
  graph_id: string;
  validation: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  normalized_proposal: GraphProposal;
  patch_groups: Array<{
    group_id: string;
    label: string;
    operations: GraphOperation[];
  }>;
  preview: {
    topic_add_count: number;
    edge_add_count: number;
    zone_add_count: number;
    zone_update_count: number;
    mastery_update_count: number;
  };
};

export type ProposalGenerateResponse = {
  proposal_envelope: GraphProposalEnvelope;
  apply_plan: ApplyPlanEnvelope;
  trace: {
    model: string;
    mode: ProposalMode;
    used_grounding: boolean;
    raw_text_present: boolean;
    source_item_count: number;
    usage_metadata: Record<string, unknown>;
  };
  display: {
    summary: string;
    highlights: string[];
  };
};

export type ProposalStreamEvent =
  | { type: "status"; stage: string; model: string }
  | { type: "delta"; text: string }
  | { type: "result"; result: ProposalGenerateResponse }
  | { type: "error"; detail: string };

export type WorkspaceConfig = {
  ai_provider: string;
  default_model: string;
  model_options: string[];
  provider_options: string[];
  ui_language: string;
  canonical_graph_language: string;
  use_google_search_grounding: boolean;
  disable_idle_animations: boolean;
  thinking_mode: "low" | "default" | "custom";
  memory_mode: "balanced" | "max" | "custom";
  assistant_nickname: string;
  persona_rules: string;
  quiz_question_count: number;
  pass_threshold: number;
  enable_closure_tests: boolean;
  debug_mode_enabled: boolean;
  memory_history_message_limit: number;
  memory_include_graph_context: boolean;
  memory_include_progress_context: boolean;
  memory_include_quiz_context: boolean;
  memory_include_frontier_context: boolean;
  memory_include_selected_topic_context: boolean;
  allow_explore_without_closure: boolean;
  require_prerequisite_closure_for_completion: boolean;
  planner_max_output_tokens: number;
  planner_thinking_budget: number;
  orchestrator_max_output_tokens: number;
  quiz_max_output_tokens: number;
  assistant_max_output_tokens: number;
  gemini_api_key: string | null;
  openai_api_key: string | null;
  openai_base_url: string;
  gemini_api_key_source?: "env" | "workspace" | "unset";
  openai_api_key_source?: "env" | "workspace" | "unset";
  openai_base_url_source?: "env" | "workspace";
};

export type DebugLogEntry = {
  id: string;
  created_at: string;
  kind: "frontend" | "api" | "server";
  level: "info" | "error";
  title: string;
  message: string;
  method?: string | null;
  path?: string | null;
  status_code?: number | null;
  duration_ms?: number | null;
  request_excerpt?: string | null;
  response_excerpt?: string | null;
  stack?: string | null;
};

export type DebugLogSnapshot = {
  file_path: string;
  frontend: DebugLogEntry[];
  api: DebugLogEntry[];
  server: DebugLogEntry[];
};

export type SnapshotRecord = {
  id: number;
  created_at: string;
  source: string;
  reason?: string | null;
  parent_snapshot_id?: number | null;
};

export type GraphExportPackagePayload = {
  kind: string;
  version: number;
  exported_at: string;
  source_graph_id: string;
  title: string;
  include_progress: boolean;
  graph: GraphEnvelope;
};

export type GraphExportFormat = "mapmind_graph_export" | "mapmind_obsidian_export";

export type ObsidianExportOptions = {
  use_folders_as_zones: boolean;
  include_descriptions: boolean;
  include_resources: boolean;
  include_artifacts: boolean;
};

export type ObsidianExportFilePayload = {
  path: string;
  body: string;
};

export type ObsidianGraphExportPackagePayload = {
  kind: "mapmind_obsidian_export";
  version: number;
  exported_at: string;
  source_graph_id: string;
  title: string;
  include_progress: boolean;
  folder_name: string;
  file_count: number;
  files: ObsidianExportFilePayload[];
};

export type WorkspaceEnvelope = {
  snapshot: SnapshotRecord;
  workspace: {
    title: string;
    active_graph_id: string | null;
    config: WorkspaceConfig;
    graphs: GraphEnvelope[];
  };
};
