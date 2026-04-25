import { describe, expect, it } from "vitest";

import { buildWorkspaceConfigPatch, deriveSettingsDrafts, isSettingsDirty } from "./settingsController";
import type { WorkspaceConfig } from "./types";

function makeConfig(): WorkspaceConfig {
  return {
    ai_provider: "gemini",
    provider_options: ["gemini", "openai"],
    default_model: "gemini-2.5-pro",
    model_options: ["gemini-2.5-pro", "gemini-2.5-flash"],
    ui_language: "en",
    canonical_graph_language: "en",
    gemini_api_key: "",
    gemini_api_key_source: "unset",
    openai_api_key: "",
    openai_api_key_source: "unset",
    openai_base_url: "https://api.openai.com/v1",
    openai_base_url_source: "workspace",
    use_google_search_grounding: true,
    thinking_mode: "default",
    memory_mode: "balanced",
    planner_max_output_tokens: 200000,
    planner_thinking_budget: 12288,
    orchestrator_max_output_tokens: 16384,
    quiz_max_output_tokens: 4096,
    assistant_max_output_tokens: 800,
    assistant_nickname: "",
    disable_idle_animations: false,
    persona_rules: "",
    quiz_question_count: 12,
    pass_threshold: 0.75,
    enable_closure_tests: true,
    debug_mode_enabled: false,
    memory_history_message_limit: 32,
    memory_include_graph_context: true,
    memory_include_progress_context: true,
    memory_include_quiz_context: true,
    memory_include_frontier_context: true,
    memory_include_selected_topic_context: true,
    allow_explore_without_closure: true,
    require_prerequisite_closure_for_completion: true,
  };
}

describe("settingsController", () => {
  it("derives stable drafts from workspace config", () => {
    const drafts = deriveSettingsDrafts(makeConfig());

    expect(drafts.provider).toBe("gemini");
    expect(drafts.model).toBe("gemini-2.5-pro");
    expect(drafts.quizPassCount).toBe(9);
  });

  it("detects dirty state only for unlocked config changes", () => {
    const config = makeConfig();
    const drafts = deriveSettingsDrafts(config);

    expect(
      isSettingsDirty({
        config,
        drafts,
        locks: {
          geminiKeyLockedByEnv: false,
          openaiKeyLockedByEnv: false,
          openaiBaseUrlLockedByEnv: false,
        },
        straightEdgeLinesEnabled: false,
      }),
    ).toBe(false);

    drafts.openaiApiKey = "secret";
    expect(
      isSettingsDirty({
        config,
        drafts,
        locks: {
          geminiKeyLockedByEnv: false,
          openaiKeyLockedByEnv: true,
          openaiBaseUrlLockedByEnv: false,
        },
        straightEdgeLinesEnabled: false,
      }),
    ).toBe(false);
  });

  it("builds a minimal patch for changed custom settings", () => {
    const config = makeConfig();
    const drafts = {
      ...deriveSettingsDrafts(config),
      thinkingMode: "custom" as const,
      plannerMaxTokens: 250000,
      debugModeEnabled: true,
      quizQuestionCount: 10,
      quizPassCount: 8,
    };

    const patch = buildWorkspaceConfigPatch({
      config,
      drafts,
      locks: {
        geminiKeyLockedByEnv: false,
        openaiKeyLockedByEnv: false,
        openaiBaseUrlLockedByEnv: false,
      },
    });

    expect(patch).toEqual({
      thinking_mode: "custom",
      planner_max_output_tokens: 250000,
      debug_mode_enabled: true,
      quiz_question_count: 10,
      pass_threshold: 0.8,
    });
  });
});
