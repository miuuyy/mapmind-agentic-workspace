import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { MEMORY_MODE_OPTIONS, THINKING_MODE_OPTIONS, type MemoryMode, type ThemeMode, type ThinkingMode } from "../lib/appContracts";
import { requiredCorrectAnswers } from "../lib/appUiHelpers";
import type { WorkspaceConfig } from "../lib/types";

const CURVED_EDGE_LINES_STORAGE_KEY = "knowledge_graph_curved_edge_lines_v1";
const THEME_MODE_STORAGE_KEY = "knowledge_graph_theme_mode_v1";

function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return raw === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const mode = readStoredThemeMode();
  document.documentElement.dataset.theme = mode;
  return mode;
}

function readStoredCurvedEdgeLines(): boolean {
  try {
    const raw = localStorage.getItem(CURVED_EDGE_LINES_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return false;
  } catch {
    return false;
  }
}

export type WorkspaceConfigPatch = {
  ai_provider?: string;
  default_model?: string;
  gemini_api_key?: string;
  openai_api_key?: string;
  openai_base_url?: string;
  thinking_mode?: ThinkingMode;
  memory_mode?: MemoryMode;
  assistant_nickname?: string;
  planner_max_output_tokens?: number;
  planner_thinking_budget?: number;
  orchestrator_max_output_tokens?: number;
  quiz_max_output_tokens?: number;
  assistant_max_output_tokens?: number;
  disable_idle_animations?: boolean;
  persona_rules?: string;
  quiz_question_count?: number;
  pass_threshold?: number;
  enable_closure_tests?: boolean;
  debug_mode_enabled?: boolean;
  memory_history_message_limit?: number;
  memory_include_graph_context?: boolean;
  memory_include_progress_context?: boolean;
  memory_include_quiz_context?: boolean;
  memory_include_frontier_context?: boolean;
  memory_include_selected_topic_context?: boolean;
};

type ModeOption<T extends string> = {
  id: T;
  label: string;
  title: string;
  description: string;
};

export type SettingsController = {
  providerDraft: string;
  setProviderDraft: Dispatch<SetStateAction<string>>;
  modelDraft: string;
  setModelDraft: Dispatch<SetStateAction<string>>;
  modelPresetDraft: string;
  setModelPresetDraft: Dispatch<SetStateAction<string>>;
  geminiKeyLockedByEnv: boolean;
  geminiApiKeyDraft: string;
  setGeminiApiKeyDraft: Dispatch<SetStateAction<string>>;
  openaiKeyLockedByEnv: boolean;
  openaiApiKeyDraft: string;
  setOpenaiApiKeyDraft: Dispatch<SetStateAction<string>>;
  providerOptions: string[];
  openaiBaseUrlDraft: string;
  setOpenaiBaseUrlDraft: Dispatch<SetStateAction<string>>;
  openaiBaseUrlLockedByEnv: boolean;
  showOpenAIEndpointDraft: boolean;
  setShowOpenAIEndpointDraft: Dispatch<SetStateAction<boolean>>;
  activeThinkingOption: ModeOption<ThinkingMode>;
  activeThinkingValues: string;
  thinkingModeDraft: ThinkingMode;
  setThinkingModeDraft: Dispatch<SetStateAction<ThinkingMode>>;
  plannerMaxTokensDraft: number;
  setPlannerMaxTokensDraft: Dispatch<SetStateAction<number>>;
  plannerThinkingBudgetDraft: number;
  setPlannerThinkingBudgetDraft: Dispatch<SetStateAction<number>>;
  orchestratorMaxTokensDraft: number;
  setOrchestratorMaxTokensDraft: Dispatch<SetStateAction<number>>;
  quizMaxTokensDraft: number;
  setQuizMaxTokensDraft: Dispatch<SetStateAction<number>>;
  assistantMaxTokensDraft: number;
  setAssistantMaxTokensDraft: Dispatch<SetStateAction<number>>;
  assistantNicknameDraft: string;
  setAssistantNicknameDraft: Dispatch<SetStateAction<string>>;
  personaDraft: string;
  setPersonaDraft: Dispatch<SetStateAction<string>>;
  disableIdleAnimationsDraft: boolean;
  setDisableIdleAnimationsDraft: Dispatch<SetStateAction<boolean>>;
  activeMemoryOption: ModeOption<MemoryMode>;
  activeMemoryValues: string;
  memoryModeDraft: MemoryMode;
  setMemoryModeDraft: Dispatch<SetStateAction<MemoryMode>>;
  memoryHistoryLimitDraft: number;
  setMemoryHistoryLimitDraft: Dispatch<SetStateAction<number>>;
  memoryIncludeGraphContextDraft: boolean;
  setMemoryIncludeGraphContextDraft: Dispatch<SetStateAction<boolean>>;
  memoryIncludeProgressContextDraft: boolean;
  setMemoryIncludeProgressContextDraft: Dispatch<SetStateAction<boolean>>;
  memoryIncludeQuizContextDraft: boolean;
  setMemoryIncludeQuizContextDraft: Dispatch<SetStateAction<boolean>>;
  memoryIncludeFrontierContextDraft: boolean;
  setMemoryIncludeFrontierContextDraft: Dispatch<SetStateAction<boolean>>;
  memoryIncludeSelectedTopicContextDraft: boolean;
  setMemoryIncludeSelectedTopicContextDraft: Dispatch<SetStateAction<boolean>>;
  enableClosureTestsDraft: boolean;
  setEnableClosureTestsDraft: Dispatch<SetStateAction<boolean>>;
  debugModeEnabledDraft: boolean;
  setDebugModeEnabledDraft: Dispatch<SetStateAction<boolean>>;
  curvedEdgeLinesDraft: boolean;
  setCurvedEdgeLinesDraft: Dispatch<SetStateAction<boolean>>;
  themeModeDraft: ThemeMode;
  setThemeModeDraft: Dispatch<SetStateAction<ThemeMode>>;
  quizQuestionCountDraft: number;
  setQuizQuestionCountDraft: Dispatch<SetStateAction<number>>;
  quizPassCountDraft: number;
  setQuizPassCountDraft: Dispatch<SetStateAction<number>>;
  settingsDirty: boolean;
  saveSettings: () => void;
};

type UseSettingsControllerArgs = {
  currentConfig: WorkspaceConfig | null;
  isSettingsOpen: boolean;
  curvedEdgeLinesEnabled: boolean;
  setCurvedEdgeLinesEnabled: Dispatch<SetStateAction<boolean>>;
  saveWorkspaceConfig: (patch: WorkspaceConfigPatch) => void;
};

export function useSettingsController({
  currentConfig,
  isSettingsOpen,
  curvedEdgeLinesEnabled,
  setCurvedEdgeLinesEnabled,
  saveWorkspaceConfig,
}: UseSettingsControllerArgs): SettingsController {
  const normalizeIntegerDraft = (value: number, minimum: number, maximum?: number): number => {
    const sanitized = Number.isFinite(value) ? Math.round(value) : minimum;
    if (typeof maximum === "number") return Math.min(maximum, Math.max(minimum, sanitized));
    return Math.max(minimum, sanitized);
  };

  const [providerDraft, setProviderDraft] = useState("gemini");
  const [modelDraft, setModelDraft] = useState("gemini-2.5-pro");
  const [modelPresetDraft, setModelPresetDraft] = useState("gemini-2.5-pro");
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState("");
  const [openaiApiKeyDraft, setOpenaiApiKeyDraft] = useState("");
  const [openaiBaseUrlDraft, setOpenaiBaseUrlDraft] = useState("https://api.openai.com/v1");
  const [showOpenAIEndpointDraft, setShowOpenAIEndpointDraft] = useState(false);
  const [personaDraft, setPersonaDraft] = useState("");
  const [thinkingModeDraft, setThinkingModeDraft] = useState<ThinkingMode>("default");
  const [memoryModeDraft, setMemoryModeDraft] = useState<MemoryMode>("balanced");
  const [plannerMaxTokensDraft, setPlannerMaxTokensDraft] = useState(200000);
  const [plannerThinkingBudgetDraft, setPlannerThinkingBudgetDraft] = useState(12288);
  const [orchestratorMaxTokensDraft, setOrchestratorMaxTokensDraft] = useState(16384);
  const [quizMaxTokensDraft, setQuizMaxTokensDraft] = useState(4096);
  const [assistantMaxTokensDraft, setAssistantMaxTokensDraft] = useState(800);
  const [assistantNicknameDraft, setAssistantNicknameDraft] = useState("");
  const [disableIdleAnimationsDraft, setDisableIdleAnimationsDraft] = useState(false);
  const [enableClosureTestsDraft, setEnableClosureTestsDraft] = useState(true);
  const [debugModeEnabledDraft, setDebugModeEnabledDraft] = useState(false);
  const [memoryHistoryLimitDraft, setMemoryHistoryLimitDraft] = useState(32);
  const [memoryIncludeGraphContextDraft, setMemoryIncludeGraphContextDraft] = useState(true);
  const [memoryIncludeProgressContextDraft, setMemoryIncludeProgressContextDraft] = useState(true);
  const [memoryIncludeQuizContextDraft, setMemoryIncludeQuizContextDraft] = useState(true);
  const [memoryIncludeFrontierContextDraft, setMemoryIncludeFrontierContextDraft] = useState(true);
  const [memoryIncludeSelectedTopicContextDraft, setMemoryIncludeSelectedTopicContextDraft] = useState(true);
  const [quizQuestionCountDraft, setQuizQuestionCountDraft] = useState(12);
  const [quizPassCountDraft, setQuizPassCountDraft] = useState(9);
  const [curvedEdgeLinesDraft, setCurvedEdgeLinesDraft] = useState<boolean>(readStoredCurvedEdgeLines);
  const [themeModeDraft, setThemeModeDraft] = useState<ThemeMode>(readInitialThemeMode);

  useEffect(() => {
    if (!currentConfig) return;
    setProviderDraft(currentConfig.ai_provider ?? "gemini");
    setModelDraft(currentConfig.default_model);
    setModelPresetDraft(currentConfig.model_options.includes(currentConfig.default_model) ? currentConfig.default_model : "__custom__");
    setGeminiApiKeyDraft(currentConfig.gemini_api_key ?? "");
    setOpenaiApiKeyDraft(currentConfig.openai_api_key ?? "");
    setOpenaiBaseUrlDraft(currentConfig.openai_base_url ?? "https://api.openai.com/v1");
    setShowOpenAIEndpointDraft((currentConfig.openai_base_url ?? "https://api.openai.com/v1") !== "https://api.openai.com/v1" || currentConfig.openai_base_url_source === "env");
    setPersonaDraft(currentConfig.persona_rules ?? "");
    setThinkingModeDraft(currentConfig.thinking_mode ?? "default");
    setMemoryModeDraft(currentConfig.memory_mode ?? "balanced");
    setPlannerMaxTokensDraft(currentConfig.planner_max_output_tokens);
    setPlannerThinkingBudgetDraft(currentConfig.planner_thinking_budget);
    setOrchestratorMaxTokensDraft(currentConfig.orchestrator_max_output_tokens);
    setQuizMaxTokensDraft(currentConfig.quiz_max_output_tokens);
    setAssistantMaxTokensDraft(currentConfig.assistant_max_output_tokens);
    setAssistantNicknameDraft(currentConfig.assistant_nickname ?? "");
    setDisableIdleAnimationsDraft(currentConfig.disable_idle_animations ?? false);
    setEnableClosureTestsDraft(currentConfig.enable_closure_tests ?? true);
    setDebugModeEnabledDraft(currentConfig.debug_mode_enabled ?? false);
    setMemoryHistoryLimitDraft(currentConfig.memory_history_message_limit ?? 32);
    setMemoryIncludeGraphContextDraft(currentConfig.memory_include_graph_context ?? true);
    setMemoryIncludeProgressContextDraft(currentConfig.memory_include_progress_context ?? true);
    setMemoryIncludeQuizContextDraft(currentConfig.memory_include_quiz_context ?? true);
    setMemoryIncludeFrontierContextDraft(currentConfig.memory_include_frontier_context ?? true);
    setMemoryIncludeSelectedTopicContextDraft(currentConfig.memory_include_selected_topic_context ?? true);
    setQuizQuestionCountDraft(currentConfig.quiz_question_count);
    setQuizPassCountDraft(requiredCorrectAnswers(currentConfig.pass_threshold, currentConfig.quiz_question_count));
  }, [currentConfig]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setCurvedEdgeLinesDraft(curvedEdgeLinesEnabled);
  }, [curvedEdgeLinesEnabled, isSettingsOpen]);

  useEffect(() => {
    setQuizPassCountDraft((current) => Math.min(current, quizQuestionCountDraft));
  }, [quizQuestionCountDraft]);

  const geminiKeyLockedByEnv = currentConfig?.gemini_api_key_source === "env";
  const openaiKeyLockedByEnv = currentConfig?.openai_api_key_source === "env";
  const openaiBaseUrlLockedByEnv = currentConfig?.openai_base_url_source === "env";
  const currentQuizPassCount = currentConfig
    ? requiredCorrectAnswers(currentConfig.pass_threshold, currentConfig.quiz_question_count)
    : 0;

  const activeThinkingOption = useMemo(
    () => THINKING_MODE_OPTIONS.find((option) => option.id === thinkingModeDraft) ?? THINKING_MODE_OPTIONS[1],
    [thinkingModeDraft],
  );
  const activeMemoryOption = useMemo(
    () => MEMORY_MODE_OPTIONS.find((option) => option.id === memoryModeDraft) ?? MEMORY_MODE_OPTIONS[1],
    [memoryModeDraft],
  );

  const activeThinkingValues =
    thinkingModeDraft === "custom"
      ? `Planner ${plannerMaxTokensDraft.toLocaleString()} · thinking ${plannerThinkingBudgetDraft.toLocaleString()} · orchestrator ${orchestratorMaxTokensDraft.toLocaleString()} · quiz ${quizMaxTokensDraft.toLocaleString()} · assistant ${assistantMaxTokensDraft.toLocaleString()}`
      : activeThinkingOption.description;
  const activeMemoryValues =
    memoryModeDraft === "custom"
      ? `${memoryHistoryLimitDraft} recent messages · graph ${memoryIncludeGraphContextDraft ? "on" : "off"} · progress ${memoryIncludeProgressContextDraft ? "on" : "off"} · quiz ${memoryIncludeQuizContextDraft ? "on" : "off"} · frontier ${memoryIncludeFrontierContextDraft ? "on" : "off"} · selected topic ${memoryIncludeSelectedTopicContextDraft ? "on" : "off"}`
      : activeMemoryOption.description;

  const settingsDirty = Boolean(
    (currentConfig && (
      providerDraft !== currentConfig.ai_provider ||
      modelDraft !== currentConfig.default_model ||
      (!geminiKeyLockedByEnv && geminiApiKeyDraft !== (currentConfig.gemini_api_key ?? "")) ||
      (!openaiKeyLockedByEnv && openaiApiKeyDraft !== (currentConfig.openai_api_key ?? "")) ||
      (!openaiBaseUrlLockedByEnv && openaiBaseUrlDraft !== currentConfig.openai_base_url) ||
      thinkingModeDraft !== currentConfig.thinking_mode ||
      memoryModeDraft !== (currentConfig.memory_mode ?? "balanced") ||
      (
        thinkingModeDraft === "custom" && (
          plannerMaxTokensDraft !== currentConfig.planner_max_output_tokens ||
          plannerThinkingBudgetDraft !== currentConfig.planner_thinking_budget ||
          orchestratorMaxTokensDraft !== currentConfig.orchestrator_max_output_tokens ||
          quizMaxTokensDraft !== currentConfig.quiz_max_output_tokens ||
          assistantMaxTokensDraft !== currentConfig.assistant_max_output_tokens
        )
      ) ||
      (
        memoryModeDraft === "custom" && (
          memoryHistoryLimitDraft !== (currentConfig.memory_history_message_limit ?? 32) ||
          memoryIncludeGraphContextDraft !== (currentConfig.memory_include_graph_context ?? true) ||
          memoryIncludeProgressContextDraft !== (currentConfig.memory_include_progress_context ?? true) ||
          memoryIncludeQuizContextDraft !== (currentConfig.memory_include_quiz_context ?? true) ||
          memoryIncludeFrontierContextDraft !== (currentConfig.memory_include_frontier_context ?? true) ||
          memoryIncludeSelectedTopicContextDraft !== (currentConfig.memory_include_selected_topic_context ?? true)
        )
      ) ||
      assistantNicknameDraft !== (currentConfig.assistant_nickname ?? "") ||
      disableIdleAnimationsDraft !== (currentConfig.disable_idle_animations ?? false) ||
      enableClosureTestsDraft !== (currentConfig.enable_closure_tests ?? true) ||
      debugModeEnabledDraft !== (currentConfig.debug_mode_enabled ?? false) ||
      personaDraft !== (currentConfig.persona_rules ?? "") ||
      quizQuestionCountDraft !== currentConfig.quiz_question_count ||
      quizPassCountDraft !== currentQuizPassCount
    )) ||
    curvedEdgeLinesDraft !== curvedEdgeLinesEnabled
  );

  function saveSettings(): void {
    if (!currentConfig) return;
    const normalizedPlannerMaxTokens = normalizeIntegerDraft(plannerMaxTokensDraft, 100);
    const normalizedPlannerThinkingBudget = normalizeIntegerDraft(plannerThinkingBudgetDraft, 100);
    const normalizedOrchestratorMaxTokens = normalizeIntegerDraft(orchestratorMaxTokensDraft, 100);
    const normalizedQuizMaxTokens = normalizeIntegerDraft(quizMaxTokensDraft, 100);
    const normalizedAssistantMaxTokens = normalizeIntegerDraft(assistantMaxTokensDraft, 100);
    const normalizedMemoryHistoryLimit = normalizeIntegerDraft(memoryHistoryLimitDraft, 4, 120);

    if (normalizedPlannerMaxTokens !== plannerMaxTokensDraft) setPlannerMaxTokensDraft(normalizedPlannerMaxTokens);
    if (normalizedPlannerThinkingBudget !== plannerThinkingBudgetDraft) setPlannerThinkingBudgetDraft(normalizedPlannerThinkingBudget);
    if (normalizedOrchestratorMaxTokens !== orchestratorMaxTokensDraft) setOrchestratorMaxTokensDraft(normalizedOrchestratorMaxTokens);
    if (normalizedQuizMaxTokens !== quizMaxTokensDraft) setQuizMaxTokensDraft(normalizedQuizMaxTokens);
    if (normalizedAssistantMaxTokens !== assistantMaxTokensDraft) setAssistantMaxTokensDraft(normalizedAssistantMaxTokens);
    if (normalizedMemoryHistoryLimit !== memoryHistoryLimitDraft) setMemoryHistoryLimitDraft(normalizedMemoryHistoryLimit);

    const patch: WorkspaceConfigPatch = {};
    if (providerDraft !== currentConfig.ai_provider) patch.ai_provider = providerDraft;
    if (modelDraft !== currentConfig.default_model) patch.default_model = modelDraft;
    if (!geminiKeyLockedByEnv && geminiApiKeyDraft !== (currentConfig.gemini_api_key ?? "")) patch.gemini_api_key = geminiApiKeyDraft;
    if (!openaiKeyLockedByEnv && openaiApiKeyDraft !== (currentConfig.openai_api_key ?? "")) patch.openai_api_key = openaiApiKeyDraft;
    if (!openaiBaseUrlLockedByEnv && openaiBaseUrlDraft !== currentConfig.openai_base_url) patch.openai_base_url = openaiBaseUrlDraft;
    if (thinkingModeDraft !== currentConfig.thinking_mode) patch.thinking_mode = thinkingModeDraft;
    if (memoryModeDraft !== (currentConfig.memory_mode ?? "balanced")) patch.memory_mode = memoryModeDraft;
    if (thinkingModeDraft === "custom") {
      if (normalizedPlannerMaxTokens !== currentConfig.planner_max_output_tokens) patch.planner_max_output_tokens = normalizedPlannerMaxTokens;
      if (normalizedPlannerThinkingBudget !== currentConfig.planner_thinking_budget) patch.planner_thinking_budget = normalizedPlannerThinkingBudget;
      if (normalizedOrchestratorMaxTokens !== currentConfig.orchestrator_max_output_tokens) patch.orchestrator_max_output_tokens = normalizedOrchestratorMaxTokens;
      if (normalizedQuizMaxTokens !== currentConfig.quiz_max_output_tokens) patch.quiz_max_output_tokens = normalizedQuizMaxTokens;
      if (normalizedAssistantMaxTokens !== currentConfig.assistant_max_output_tokens) patch.assistant_max_output_tokens = normalizedAssistantMaxTokens;
    }
    if (assistantNicknameDraft !== (currentConfig.assistant_nickname ?? "")) patch.assistant_nickname = assistantNicknameDraft;
    if (memoryModeDraft === "custom") {
      if (normalizedMemoryHistoryLimit !== (currentConfig.memory_history_message_limit ?? 32)) patch.memory_history_message_limit = normalizedMemoryHistoryLimit;
      if (memoryIncludeGraphContextDraft !== (currentConfig.memory_include_graph_context ?? true)) patch.memory_include_graph_context = memoryIncludeGraphContextDraft;
      if (memoryIncludeProgressContextDraft !== (currentConfig.memory_include_progress_context ?? true)) patch.memory_include_progress_context = memoryIncludeProgressContextDraft;
      if (memoryIncludeQuizContextDraft !== (currentConfig.memory_include_quiz_context ?? true)) patch.memory_include_quiz_context = memoryIncludeQuizContextDraft;
      if (memoryIncludeFrontierContextDraft !== (currentConfig.memory_include_frontier_context ?? true)) patch.memory_include_frontier_context = memoryIncludeFrontierContextDraft;
      if (memoryIncludeSelectedTopicContextDraft !== (currentConfig.memory_include_selected_topic_context ?? true)) patch.memory_include_selected_topic_context = memoryIncludeSelectedTopicContextDraft;
    }
    if (disableIdleAnimationsDraft !== (currentConfig.disable_idle_animations ?? false)) patch.disable_idle_animations = disableIdleAnimationsDraft;
    if (enableClosureTestsDraft !== (currentConfig.enable_closure_tests ?? true)) patch.enable_closure_tests = enableClosureTestsDraft;
    if (debugModeEnabledDraft !== (currentConfig.debug_mode_enabled ?? false)) patch.debug_mode_enabled = debugModeEnabledDraft;
    if (personaDraft !== (currentConfig.persona_rules ?? "")) patch.persona_rules = personaDraft;
    if (quizQuestionCountDraft !== currentConfig.quiz_question_count) patch.quiz_question_count = quizQuestionCountDraft;
    if (quizPassCountDraft !== currentQuizPassCount || quizQuestionCountDraft !== currentConfig.quiz_question_count) {
      patch.pass_threshold = quizPassCountDraft / quizQuestionCountDraft;
    }
    if (curvedEdgeLinesDraft !== curvedEdgeLinesEnabled) {
      setCurvedEdgeLinesEnabled(curvedEdgeLinesDraft);
    }
    if (Object.keys(patch).length > 0) {
      saveWorkspaceConfig(patch);
    }
  }

  return {
    providerDraft,
    setProviderDraft,
    modelDraft,
    setModelDraft,
    modelPresetDraft,
    setModelPresetDraft,
    geminiKeyLockedByEnv,
    geminiApiKeyDraft,
    setGeminiApiKeyDraft,
    openaiKeyLockedByEnv,
    openaiApiKeyDraft,
    setOpenaiApiKeyDraft,
    providerOptions: currentConfig?.provider_options ?? ["gemini", "openai"],
    openaiBaseUrlDraft,
    setOpenaiBaseUrlDraft,
    openaiBaseUrlLockedByEnv,
    showOpenAIEndpointDraft,
    setShowOpenAIEndpointDraft,
    activeThinkingOption,
    activeThinkingValues,
    thinkingModeDraft,
    setThinkingModeDraft,
    plannerMaxTokensDraft,
    setPlannerMaxTokensDraft,
    plannerThinkingBudgetDraft,
    setPlannerThinkingBudgetDraft,
    orchestratorMaxTokensDraft,
    setOrchestratorMaxTokensDraft,
    quizMaxTokensDraft,
    setQuizMaxTokensDraft,
    assistantMaxTokensDraft,
    setAssistantMaxTokensDraft,
    assistantNicknameDraft,
    setAssistantNicknameDraft,
    personaDraft,
    setPersonaDraft,
    disableIdleAnimationsDraft,
    setDisableIdleAnimationsDraft,
    activeMemoryOption,
    activeMemoryValues,
    memoryModeDraft,
    setMemoryModeDraft,
    memoryHistoryLimitDraft,
    setMemoryHistoryLimitDraft,
    memoryIncludeGraphContextDraft,
    setMemoryIncludeGraphContextDraft,
    memoryIncludeProgressContextDraft,
    setMemoryIncludeProgressContextDraft,
    memoryIncludeQuizContextDraft,
    setMemoryIncludeQuizContextDraft,
    memoryIncludeFrontierContextDraft,
    setMemoryIncludeFrontierContextDraft,
    memoryIncludeSelectedTopicContextDraft,
    setMemoryIncludeSelectedTopicContextDraft,
    enableClosureTestsDraft,
    setEnableClosureTestsDraft,
    debugModeEnabledDraft,
    setDebugModeEnabledDraft,
    curvedEdgeLinesDraft,
    setCurvedEdgeLinesDraft,
    themeModeDraft,
    setThemeModeDraft,
    quizQuestionCountDraft,
    setQuizQuestionCountDraft,
    quizPassCountDraft,
    setQuizPassCountDraft,
    settingsDirty,
    saveSettings,
  };
}
