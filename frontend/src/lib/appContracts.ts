import type { Dispatch, SetStateAction } from "react";

import type { ChatMessage } from "./types";

export const ASSISTANT_WIDTH_STORAGE_KEY = "knowledge_graph_assistant_width_v1";
export const ASSISTANT_MAX_WIDTH = 620;
export const ASSISTANT_MIN_WIDTH = 280;
export const ASSISTANT_COLLAPSE_THRESHOLD = 210;
export const APP_LOGO_SRC = "/mmlogo.png";

export type ThinkingMode = "low" | "default" | "custom";
export type MemoryMode = "balanced" | "max" | "custom";

export const THINKING_MODE_OPTIONS: Array<{
  id: ThinkingMode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "low",
    label: "Low",
    title: "Restrained generation",
    description: "Conservative scope. Planner 90k, thinking 2k, orchestrator 8k, quiz 3k, assistant 700.",
  },
  {
    id: "default",
    label: "Default",
    title: "Balanced generation",
    description: "Recommended balance. Planner 200k, thinking 12k, orchestrator 16k, quiz 4k, assistant 800.",
  },
  {
    id: "custom",
    label: "Custom",
    title: "Manual token budgets",
    description: "Lets you set provider-facing generation budgets yourself instead of using a preset.",
  },
];

export const MEMORY_MODE_OPTIONS: Array<{
  id: MemoryMode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    title: "Recommended",
    description: "32 recent messages. Keeps graph, progress, quiz, frontier, and selected-topic context.",
  },
  {
    id: "max",
    label: "Max",
    title: "Wider recall",
    description: "64 recent messages. Keeps all context blocks for harder study sessions.",
  },
  {
    id: "custom",
    label: "Custom",
    title: "Manual context mix",
    description: "Lets you choose exactly which context blocks and how much recent history the agent sees.",
  },
];

export type GraphChatState = {
  input: string;
  messages: ChatMessage[];
};

export type WorkspaceSurfacePayload = {
  onboarding_state: "needs_first_graph" | "active_workspace";
  active_graph_id?: string | null;
  graph_count: number;
  personal_graph_count: number;
  demo_graph_count: number;
  graph_limit: number;
  library_post_count: number;
  demo_library_post_id?: string | null;
  primary_action: "create_graph" | "resume_workspace";
  recommended_actions: Array<"create_graph" | "resume_workspace">;
  can_create_graph: boolean;
  can_import_from_library: boolean;
  grounding_default_enabled: boolean;
};

export type AuthSessionPayload = {
  authenticated: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string | null;
    ui_language: "en";
    created_at: string;
    last_login_at?: string | null;
    active_workspace_id?: string | null;
  } | null;
  workspace_surface?: WorkspaceSurfacePayload | null;
};

export type ThemeMode = "dark" | "light";

export type SettingsDrafts = {
  provider: string;
  model: string;
  modelPreset: string;
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  showOpenAIEndpoint: boolean;
  thinkingMode: ThinkingMode;
  plannerMaxTokens: number;
  plannerThinkingBudget: number;
  orchestratorMaxTokens: number;
  quizMaxTokens: number;
  assistantMaxTokens: number;
  assistantNickname: string;
  persona: string;
  disableIdleAnimations: boolean;
  memoryMode: MemoryMode;
  memoryHistoryLimit: number;
  memoryIncludeGraphContext: boolean;
  memoryIncludeProgressContext: boolean;
  memoryIncludeQuizContext: boolean;
  memoryIncludeFrontierContext: boolean;
  memoryIncludeSelectedTopicContext: boolean;
  enableClosureTests: boolean;
  debugModeEnabled: boolean;
  straightEdgeLines: boolean;
  themeMode: ThemeMode;
  quizQuestionCount: number;
  quizPassCount: number;
};

export type SettingsDraftSetters = {
  provider: Dispatch<SetStateAction<string>>;
  model: Dispatch<SetStateAction<string>>;
  modelPreset: Dispatch<SetStateAction<string>>;
  geminiApiKey: Dispatch<SetStateAction<string>>;
  openaiApiKey: Dispatch<SetStateAction<string>>;
  openaiBaseUrl: Dispatch<SetStateAction<string>>;
  showOpenAIEndpoint: Dispatch<SetStateAction<boolean>>;
  thinkingMode: Dispatch<SetStateAction<ThinkingMode>>;
  plannerMaxTokens: Dispatch<SetStateAction<number>>;
  plannerThinkingBudget: Dispatch<SetStateAction<number>>;
  orchestratorMaxTokens: Dispatch<SetStateAction<number>>;
  quizMaxTokens: Dispatch<SetStateAction<number>>;
  assistantMaxTokens: Dispatch<SetStateAction<number>>;
  assistantNickname: Dispatch<SetStateAction<string>>;
  persona: Dispatch<SetStateAction<string>>;
  disableIdleAnimations: Dispatch<SetStateAction<boolean>>;
  memoryMode: Dispatch<SetStateAction<MemoryMode>>;
  memoryHistoryLimit: Dispatch<SetStateAction<number>>;
  memoryIncludeGraphContext: Dispatch<SetStateAction<boolean>>;
  memoryIncludeProgressContext: Dispatch<SetStateAction<boolean>>;
  memoryIncludeQuizContext: Dispatch<SetStateAction<boolean>>;
  memoryIncludeFrontierContext: Dispatch<SetStateAction<boolean>>;
  memoryIncludeSelectedTopicContext: Dispatch<SetStateAction<boolean>>;
  enableClosureTests: Dispatch<SetStateAction<boolean>>;
  debugModeEnabled: Dispatch<SetStateAction<boolean>>;
  straightEdgeLines: Dispatch<SetStateAction<boolean>>;
  themeMode: Dispatch<SetStateAction<ThemeMode>>;
  quizQuestionCount: Dispatch<SetStateAction<number>>;
  quizPassCount: Dispatch<SetStateAction<number>>;
};
