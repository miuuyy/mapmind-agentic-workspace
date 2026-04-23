import type { SettingsDrafts, WorkspaceConfigPatch } from "./appContracts";
import { requiredCorrectAnswers } from "./appUiHelpers";
import type { WorkspaceConfig } from "./types";

export type SettingsLocks = {
  geminiKeyLockedByEnv: boolean;
  openaiKeyLockedByEnv: boolean;
  openaiBaseUrlLockedByEnv: boolean;
};

export function deriveSettingsDrafts(config: WorkspaceConfig): SettingsDrafts {
  return {
    provider: config.ai_provider ?? "gemini",
    model: config.default_model,
    modelPreset: config.model_options.includes(config.default_model) ? config.default_model : "__custom__",
    geminiApiKey: config.gemini_api_key ?? "",
    openaiApiKey: config.openai_api_key ?? "",
    openaiBaseUrl: config.openai_base_url ?? "https://api.openai.com/v1",
    showOpenAIEndpoint:
      (config.openai_base_url ?? "https://api.openai.com/v1") !== "https://api.openai.com/v1"
      || config.openai_base_url_source === "env",
    thinkingMode: config.thinking_mode ?? "default",
    plannerMaxTokens: config.planner_max_output_tokens,
    plannerThinkingBudget: config.planner_thinking_budget,
    orchestratorMaxTokens: config.orchestrator_max_output_tokens,
    quizMaxTokens: config.quiz_max_output_tokens,
    assistantMaxTokens: config.assistant_max_output_tokens,
    assistantNickname: config.assistant_nickname ?? "",
    persona: config.persona_rules ?? "",
    disableIdleAnimations: config.disable_idle_animations ?? false,
    memoryMode: config.memory_mode ?? "balanced",
    memoryHistoryLimit: config.memory_history_message_limit ?? 32,
    memoryIncludeGraphContext: config.memory_include_graph_context ?? true,
    memoryIncludeProgressContext: config.memory_include_progress_context ?? true,
    memoryIncludeQuizContext: config.memory_include_quiz_context ?? true,
    memoryIncludeFrontierContext: config.memory_include_frontier_context ?? true,
    memoryIncludeSelectedTopicContext: config.memory_include_selected_topic_context ?? true,
    enableClosureTests: config.enable_closure_tests ?? true,
    debugModeEnabled: config.debug_mode_enabled ?? false,
    straightEdgeLines: false,
    themeMode: "dark",
    quizQuestionCount: config.quiz_question_count,
    quizPassCount: requiredCorrectAnswers(config.pass_threshold, config.quiz_question_count),
  };
}

export function isSettingsDirty(args: {
  config: WorkspaceConfig | null;
  drafts: SettingsDrafts;
  locks: SettingsLocks;
  straightEdgeLinesEnabled: boolean;
}): boolean {
  const { config, drafts, locks, straightEdgeLinesEnabled } = args;
  if (!config) return false;
  const currentQuizPassCount = requiredCorrectAnswers(config.pass_threshold, config.quiz_question_count);
  return Boolean(
    drafts.provider !== config.ai_provider
    || drafts.model !== config.default_model
    || (!locks.geminiKeyLockedByEnv && drafts.geminiApiKey !== (config.gemini_api_key ?? ""))
    || (!locks.openaiKeyLockedByEnv && drafts.openaiApiKey !== (config.openai_api_key ?? ""))
    || (!locks.openaiBaseUrlLockedByEnv && drafts.openaiBaseUrl !== config.openai_base_url)
    || drafts.thinkingMode !== config.thinking_mode
    || drafts.memoryMode !== (config.memory_mode ?? "balanced")
    || (
      drafts.thinkingMode === "custom" && (
        drafts.plannerMaxTokens !== config.planner_max_output_tokens
        || drafts.plannerThinkingBudget !== config.planner_thinking_budget
        || drafts.orchestratorMaxTokens !== config.orchestrator_max_output_tokens
        || drafts.quizMaxTokens !== config.quiz_max_output_tokens
        || drafts.assistantMaxTokens !== config.assistant_max_output_tokens
      )
    )
    || (
      drafts.memoryMode === "custom" && (
        drafts.memoryHistoryLimit !== (config.memory_history_message_limit ?? 32)
        || drafts.memoryIncludeGraphContext !== (config.memory_include_graph_context ?? true)
        || drafts.memoryIncludeProgressContext !== (config.memory_include_progress_context ?? true)
        || drafts.memoryIncludeQuizContext !== (config.memory_include_quiz_context ?? true)
        || drafts.memoryIncludeFrontierContext !== (config.memory_include_frontier_context ?? true)
        || drafts.memoryIncludeSelectedTopicContext !== (config.memory_include_selected_topic_context ?? true)
      )
    )
    || drafts.assistantNickname !== (config.assistant_nickname ?? "")
    || drafts.disableIdleAnimations !== (config.disable_idle_animations ?? false)
    || drafts.enableClosureTests !== (config.enable_closure_tests ?? true)
    || drafts.debugModeEnabled !== (config.debug_mode_enabled ?? false)
    || drafts.persona !== (config.persona_rules ?? "")
    || drafts.quizQuestionCount !== config.quiz_question_count
    || drafts.quizPassCount !== currentQuizPassCount
    || drafts.straightEdgeLines !== straightEdgeLinesEnabled
  );
}

export function buildWorkspaceConfigPatch(args: {
  config: WorkspaceConfig;
  drafts: SettingsDrafts;
  locks: SettingsLocks;
}): WorkspaceConfigPatch {
  const { config, drafts, locks } = args;
  const patch: WorkspaceConfigPatch = {};
  const currentQuizPassCount = requiredCorrectAnswers(config.pass_threshold, config.quiz_question_count);

  if (drafts.provider !== config.ai_provider) patch.ai_provider = drafts.provider;
  if (drafts.model !== config.default_model) patch.default_model = drafts.model;
  if (!locks.geminiKeyLockedByEnv && drafts.geminiApiKey !== (config.gemini_api_key ?? "")) patch.gemini_api_key = drafts.geminiApiKey;
  if (!locks.openaiKeyLockedByEnv && drafts.openaiApiKey !== (config.openai_api_key ?? "")) patch.openai_api_key = drafts.openaiApiKey;
  if (!locks.openaiBaseUrlLockedByEnv && drafts.openaiBaseUrl !== config.openai_base_url) patch.openai_base_url = drafts.openaiBaseUrl;
  if (drafts.thinkingMode !== config.thinking_mode) patch.thinking_mode = drafts.thinkingMode;
  if (drafts.memoryMode !== (config.memory_mode ?? "balanced")) patch.memory_mode = drafts.memoryMode;

  if (drafts.thinkingMode === "custom") {
    if (drafts.plannerMaxTokens !== config.planner_max_output_tokens) patch.planner_max_output_tokens = drafts.plannerMaxTokens;
    if (drafts.plannerThinkingBudget !== config.planner_thinking_budget) patch.planner_thinking_budget = drafts.plannerThinkingBudget;
    if (drafts.orchestratorMaxTokens !== config.orchestrator_max_output_tokens) patch.orchestrator_max_output_tokens = drafts.orchestratorMaxTokens;
    if (drafts.quizMaxTokens !== config.quiz_max_output_tokens) patch.quiz_max_output_tokens = drafts.quizMaxTokens;
    if (drafts.assistantMaxTokens !== config.assistant_max_output_tokens) patch.assistant_max_output_tokens = drafts.assistantMaxTokens;
  }

  if (drafts.assistantNickname !== (config.assistant_nickname ?? "")) patch.assistant_nickname = drafts.assistantNickname;
  if (drafts.memoryMode === "custom") {
    if (drafts.memoryHistoryLimit !== (config.memory_history_message_limit ?? 32)) patch.memory_history_message_limit = drafts.memoryHistoryLimit;
    if (drafts.memoryIncludeGraphContext !== (config.memory_include_graph_context ?? true)) patch.memory_include_graph_context = drafts.memoryIncludeGraphContext;
    if (drafts.memoryIncludeProgressContext !== (config.memory_include_progress_context ?? true)) patch.memory_include_progress_context = drafts.memoryIncludeProgressContext;
    if (drafts.memoryIncludeQuizContext !== (config.memory_include_quiz_context ?? true)) patch.memory_include_quiz_context = drafts.memoryIncludeQuizContext;
    if (drafts.memoryIncludeFrontierContext !== (config.memory_include_frontier_context ?? true)) patch.memory_include_frontier_context = drafts.memoryIncludeFrontierContext;
    if (drafts.memoryIncludeSelectedTopicContext !== (config.memory_include_selected_topic_context ?? true)) patch.memory_include_selected_topic_context = drafts.memoryIncludeSelectedTopicContext;
  }

  if (drafts.disableIdleAnimations !== (config.disable_idle_animations ?? false)) patch.disable_idle_animations = drafts.disableIdleAnimations;
  if (drafts.enableClosureTests !== (config.enable_closure_tests ?? true)) patch.enable_closure_tests = drafts.enableClosureTests;
  if (drafts.debugModeEnabled !== (config.debug_mode_enabled ?? false)) patch.debug_mode_enabled = drafts.debugModeEnabled;
  if (drafts.persona !== (config.persona_rules ?? "")) patch.persona_rules = drafts.persona;
  if (drafts.quizQuestionCount !== config.quiz_question_count) patch.quiz_question_count = drafts.quizQuestionCount;
  if (drafts.quizPassCount !== currentQuizPassCount || drafts.quizQuestionCount !== config.quiz_question_count) {
    patch.pass_threshold = drafts.quizPassCount / drafts.quizQuestionCount;
  }

  return patch;
}
