import React from "react";

import { Card } from "./Card";
import { MEMORY_MODE_OPTIONS, THINKING_MODE_OPTIONS, type MemoryMode, type ThemeMode, type ThinkingMode } from "../lib/appContracts";
import type { AppCopy } from "../lib/appCopy";
import type { GraphEnvelope, SnapshotRecord, WorkspaceConfig, WorkspaceEnvelope } from "../lib/types";

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;
type SupportedProvider = "gemini" | "openai";

const DEFAULT_PROVIDER_MODELS: Record<SupportedProvider, string[]> = {
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.1", "gpt-4.1", "gpt-4.1-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-pro-preview", "gemini-3-flash-preview"],
};

type ModeOption<T extends string> = {
  id: T;
  label: string;
  title: string;
  description: string;
};

type SettingsModalProps = {
  isSettingsOpen: boolean;
  logsOpen: boolean;
  copy: AppCopy;
  setSettingsOpen: StateSetter<boolean>;
  currentConfig: WorkspaceConfig | null;
  providerDraft: string;
  setProviderDraft: StateSetter<string>;
  modelDraft: string;
  setModelDraft: StateSetter<string>;
  modelPresetDraft: string;
  setModelPresetDraft: StateSetter<string>;
  geminiKeyLockedByEnv: boolean;
  geminiApiKeyDraft: string;
  setGeminiApiKeyDraft: StateSetter<string>;
  openaiKeyLockedByEnv: boolean;
  openaiApiKeyDraft: string;
  setOpenaiApiKeyDraft: StateSetter<string>;
  providerOptions: string[];
  openaiBaseUrlDraft: string;
  setOpenaiBaseUrlDraft: StateSetter<string>;
  openaiBaseUrlLockedByEnv: boolean;
  showOpenAIEndpointDraft: boolean;
  setShowOpenAIEndpointDraft: StateSetter<boolean>;
  activeThinkingOption: ModeOption<ThinkingMode>;
  activeThinkingValues: string;
  thinkingModeDraft: ThinkingMode;
  setThinkingModeDraft: StateSetter<ThinkingMode>;
  plannerMaxTokensDraft: number;
  setPlannerMaxTokensDraft: StateSetter<number>;
  plannerThinkingBudgetDraft: number;
  setPlannerThinkingBudgetDraft: StateSetter<number>;
  orchestratorMaxTokensDraft: number;
  setOrchestratorMaxTokensDraft: StateSetter<number>;
  quizMaxTokensDraft: number;
  setQuizMaxTokensDraft: StateSetter<number>;
  assistantMaxTokensDraft: number;
  setAssistantMaxTokensDraft: StateSetter<number>;
  personaDraft: string;
  setPersonaDraft: StateSetter<string>;
  disableIdleAnimationsDraft: boolean;
  setDisableIdleAnimationsDraft: StateSetter<boolean>;
  activeMemoryOption: ModeOption<MemoryMode>;
  activeMemoryValues: string;
  memoryModeDraft: MemoryMode;
  setMemoryModeDraft: StateSetter<MemoryMode>;
  memoryHistoryLimitDraft: number;
  setMemoryHistoryLimitDraft: StateSetter<number>;
  memoryIncludeGraphContextDraft: boolean;
  setMemoryIncludeGraphContextDraft: StateSetter<boolean>;
  memoryIncludeProgressContextDraft: boolean;
  setMemoryIncludeProgressContextDraft: StateSetter<boolean>;
  memoryIncludeQuizContextDraft: boolean;
  setMemoryIncludeQuizContextDraft: StateSetter<boolean>;
  memoryIncludeFrontierContextDraft: boolean;
  setMemoryIncludeFrontierContextDraft: StateSetter<boolean>;
  memoryIncludeSelectedTopicContextDraft: boolean;
  setMemoryIncludeSelectedTopicContextDraft: StateSetter<boolean>;
  activeGraph: GraphEnvelope | null;
  loadSnapshots: () => Promise<void>;
  historyLoading: boolean;
  historyError: string | null;
  snapshots: SnapshotRecord[];
  data: WorkspaceEnvelope | null;
  rollbackSnapshot: (snapshotId: number) => Promise<void>;
  enableClosureTestsDraft: boolean;
  setEnableClosureTestsDraft: StateSetter<boolean>;
  debugModeEnabledDraft: boolean;
  setDebugModeEnabledDraft: StateSetter<boolean>;
  curvedEdgeLinesDraft: boolean;
  setCurvedEdgeLinesDraft: StateSetter<boolean>;
  themeModeDraft: ThemeMode;
  setThemeModeDraft: StateSetter<ThemeMode>;
  quizQuestionCountDraft: number;
  setQuizQuestionCountDraft: StateSetter<number>;
  quizPassCountDraft: number;
  setQuizPassCountDraft: StateSetter<number>;
  configSaving: boolean;
  settingsDirty: boolean;
  saveSettings: () => void;
};

export function SettingsModal(props: SettingsModalProps): React.JSX.Element | null {
  const {
    isSettingsOpen,
    logsOpen,
    copy,
    setSettingsOpen,
    currentConfig,
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
    providerOptions,
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
    activeGraph,
    loadSnapshots,
    historyLoading,
    historyError,
    snapshots,
    data,
    rollbackSnapshot,
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
    configSaving,
    settingsDirty,
    saveSettings,
  } = props;
  const resolvedProvider = providerDraft === "openai" ? "openai" : "gemini";
  const providerModelOptions = (
    providerDraft === currentConfig?.ai_provider
      ? currentConfig.model_options
      : DEFAULT_PROVIDER_MODELS[resolvedProvider]
  ) ?? [];
  const snapshotsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [snapshotsScrolledTop, setSnapshotsScrolledTop] = React.useState(false);
  const [snapshotsScrolledBottom, setSnapshotsScrolledBottom] = React.useState(false);

  React.useEffect(() => {
    const el = snapshotsScrollRef.current;
    if (!el) return;

    const syncSnapshotsScrollState = () => {
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      setSnapshotsScrolledTop(el.scrollTop > 2);
      setSnapshotsScrolledBottom(el.scrollTop < maxScrollTop - 2);
    };

    syncSnapshotsScrollState();
    el.addEventListener("scroll", syncSnapshotsScrollState, { passive: true });
    window.addEventListener("resize", syncSnapshotsScrollState);

    return () => {
      el.removeEventListener("scroll", syncSnapshotsScrollState);
      window.removeEventListener("resize", syncSnapshotsScrollState);
    };
  }, [isSettingsOpen, activeGraph?.graph_id, historyError, snapshots.length]);

  if (!isSettingsOpen) {
    return null;
  }

  return (
    <div
      className={`quizOverlay settingsOverlay ${logsOpen ? "settingsOverlayCoexisting settingsOverlaySettings" : ""}`}
      style={{ zIndex: 100 }}
    >
      <div className="settingsModal">
        <div className="settingsContent">
          <div className="settingsContentHeader">
            <h2>{copy.settings.workspaceConfiguration}</h2>
            <button
              className="modalCloseButton"
              onClick={() => setSettingsOpen(false)}
              type="button"
              aria-label={copy.settingsPanel.closeSettings}
            >
              <span style={{ transform: "translateY(-1px)", display: "block" }}>✕</span>
            </button>
          </div>

          <div className="settingsContentScroll">
            <div className="settingsConfigSurface">
              <div className="settingsConfigGrid">
                <div className="settingsPrimaryColumn">
                  <section className="settingsPanel settingsPanelWide">
                    <div className="settingsPanelHeader">
                      <div>
                        <div className="settingsPanelEyebrow">Providers</div>
                        <div className="settingsPanelTitle">Model provider</div>
                      </div>
                    </div>
                    <div className="settingsPanelBody">
                      <div className="settingsLead">
                        MapMind runs locally. Choose the active provider and model, then keep credentials in workspace config so the shell stays provider-agnostic.
                      </div>
                      <div className="settingsInlineFields">
                        <label className="field">
                          <span className="fieldLabel">Provider</span>
                          <select
                            className="input"
                            value={providerDraft}
                            onChange={(event) => {
                              const nextProvider = event.target.value;
                              const nextOptions = DEFAULT_PROVIDER_MODELS[nextProvider === "openai" ? "openai" : "gemini"];
                              setProviderDraft(nextProvider);
                              setModelDraft((current) => nextOptions.includes(current) ? current : nextOptions[0]);
                              setModelPresetDraft((current) => current !== "__custom__" && nextOptions.includes(current) ? current : nextOptions[0]);
                            }}
                          >
                            {providerOptions.map((providerId) => (
                              <option key={providerId} value={providerId}>{providerId}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="fieldLabel">Model</span>
                          <select
                            className="input"
                            value={modelPresetDraft}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setModelPresetDraft(nextValue);
                              if (nextValue !== "__custom__") {
                                setModelDraft(nextValue);
                              }
                            }}
                          >
                            {providerModelOptions.map((modelId) => (
                              <option key={modelId} value={modelId}>{modelId}</option>
                            ))}
                            <option value="__custom__">Custom…</option>
                          </select>
                        </label>
                      </div>
                      {modelPresetDraft === "__custom__" ? (
                        <label className="field">
                          <span className="fieldLabel">Custom model id</span>
                          <input
                            className="input"
                            value={modelDraft}
                            onChange={(event) => setModelDraft(event.target.value)}
                            placeholder={providerDraft === "openai" ? "gpt-5.4-mini" : "gemini-3.1-pro"}
                          />
                        </label>
                      ) : null}
                      <label className="field">
                        <span className="fieldLabel">Gemini API key</span>
                        <input
                          className="input"
                          value={geminiKeyLockedByEnv ? "Provided by .env" : geminiApiKeyDraft}
                          onChange={(event) => setGeminiApiKeyDraft(event.target.value)}
                          placeholder="AIza..."
                          disabled={geminiKeyLockedByEnv}
                        />
                      </label>
                      {geminiKeyLockedByEnv ? (
                        <div className="settingsInlineNotice">
                          Gemini key is coming from `.env`, so it has higher priority than workspace config and cannot be changed here.
                        </div>
                      ) : null}
                      <label className="field">
                        <span className="fieldLabel">OpenAI API key</span>
                        <input
                          className="input"
                          value={openaiKeyLockedByEnv ? "Provided by .env" : openaiApiKeyDraft}
                          onChange={(event) => setOpenaiApiKeyDraft(event.target.value)}
                          placeholder="sk-..."
                          disabled={openaiKeyLockedByEnv}
                        />
                      </label>
                      {openaiKeyLockedByEnv ? (
                        <div className="settingsInlineNotice">
                          OpenAI key is coming from `.env`, so it has higher priority than workspace config and cannot be changed here.
                        </div>
                      ) : null}
                      {providerDraft === "openai" ? (
                        <>
                          <div className="mutedSmall" style={{ marginTop: -4 }}>
                            <button
                              type="button"
                              onClick={() => setShowOpenAIEndpointDraft((current) => !current)}
                              style={{
                                appearance: "none",
                                border: 0,
                                background: "transparent",
                                color: themeModeDraft === "light" ? "rgba(17,24,39,0.62)" : "rgba(255,255,255,0.62)",
                                padding: 0,
                                font: "inherit",
                                cursor: "pointer",
                                textDecoration: "underline",
                                textUnderlineOffset: "3px",
                              }}
                            >
                              {showOpenAIEndpointDraft ? "Hide custom endpoint" : "Use custom endpoint"}
                            </button>
                          </div>
                          {showOpenAIEndpointDraft ? (
                            <>
                              <label className="field">
                                <span className="fieldLabel">OpenAI-compatible endpoint (advanced)</span>
                                <input
                                  className="input"
                                  value={openaiBaseUrlDraft}
                                  onChange={(event) => setOpenaiBaseUrlDraft(event.target.value)}
                                  placeholder="https://api.openai.com/v1"
                                  disabled={openaiBaseUrlLockedByEnv}
                                />
                              </label>
                              <div className="settingsInlineNotice">
                                You do not need this for the official OpenAI API. Use it only for OpenAI-compatible gateways or local proxies.
                              </div>
                            </>
                          ) : null}
                          {openaiBaseUrlLockedByEnv ? (
                            <div className="settingsInlineNotice">
                              OpenAI endpoint is coming from `.env`, so it has higher priority than workspace config and cannot be changed here.
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </section>
                  <section className="settingsPanel settingsPanelWide">
                    <div className="settingsPanelHeader">
                      <div>
                        <div className="settingsPanelEyebrow">{copy.settingsPanel.aiBehavior}</div>
                        <div className="settingsPanelTitle">{copy.settingsPanel.thinking}</div>
                      </div>
                    </div>
                    <div className="settingsPanelBody">
                      <div className="settingsLead">
                        {copy.settingsPanel.thinkingLead}
                      </div>
                      <div className="thinkingModeSwitch">
                        {THINKING_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            className={`thinkingModeChip ${thinkingModeDraft === option.id ? "thinkingModeChipActive" : ""}`}
                            onClick={() => setThinkingModeDraft(option.id)}
                            type="button"
                          >
                            <span className="thinkingModeChipLabel">{option.label}</span>
                            <span className="thinkingModeChipTitle">{option.title}</span>
                          </button>
                        ))}
                      </div>
                      <div className="settingsInlineNotice">
                        <strong>{activeThinkingOption.label}</strong>: {activeThinkingValues}
                      </div>
                      {thinkingModeDraft === "custom" ? (
                        <div className="settingsInlineFields">
                          <label className="field">
                            <span className="fieldLabel">Planner max output tokens</span>
                            <input className="input" type="number" min={100} step={100} value={plannerMaxTokensDraft} onChange={(event) => setPlannerMaxTokensDraft(Number(event.target.value) || 100)} />
                          </label>
                          <label className="field">
                            <span className="fieldLabel">Planner thinking budget</span>
                            <input className="input" type="number" min={100} step={100} value={plannerThinkingBudgetDraft} onChange={(event) => setPlannerThinkingBudgetDraft(Number(event.target.value) || 100)} />
                          </label>
                          <label className="field">
                            <span className="fieldLabel">Chat orchestrator max output tokens</span>
                            <input className="input" type="number" min={100} step={100} value={orchestratorMaxTokensDraft} onChange={(event) => setOrchestratorMaxTokensDraft(Number(event.target.value) || 100)} />
                          </label>
                          <label className="field">
                            <span className="fieldLabel">Quiz max output tokens</span>
                            <input className="input" type="number" min={100} step={100} value={quizMaxTokensDraft} onChange={(event) => setQuizMaxTokensDraft(Number(event.target.value) || 100)} />
                          </label>
                          <label className="field">
                            <span className="fieldLabel">Assistant max output tokens</span>
                            <input className="input" type="number" min={100} step={100} value={assistantMaxTokensDraft} onChange={(event) => setAssistantMaxTokensDraft(Number(event.target.value) || 100)} />
                          </label>
                        </div>
                      ) : null}
                      <label className="field">
                        <span className="fieldLabel">{copy.settingsPanel.personaRules}</span>
                        <textarea
                          className="textarea textareaCompact textareaPersona"
                          value={personaDraft}
                          onChange={(event) => setPersonaDraft(event.target.value)}
                          placeholder={copy.settingsPanel.personaPlaceholder}
                        />
                      </label>
                      <label className="settingsToggleRow" htmlFor="idle-animations-toggle">
                        <div className="settingsToggleCopy">
                          <span className="fieldLabel">{copy.settingsPanel.idleGraphMotion}</span>
                          <span className="mutedSmall">{copy.settingsPanel.idleGraphMotionHelp}</span>
                        </div>
                        <button
                          id="idle-animations-toggle"
                          className={`settingsSwitch ${disableIdleAnimationsDraft ? "settingsSwitchActive" : ""}`}
                          onClick={() => setDisableIdleAnimationsDraft((current) => !current)}
                          type="button"
                          aria-pressed={disableIdleAnimationsDraft}
                        >
                          <span className="settingsSwitchKnob" />
                        </button>
                      </label>
                      <label className="settingsToggleRow" htmlFor="debug-mode-toggle">
                        <div className="settingsToggleCopy">
                          <span className="fieldLabel">{copy.settingsPanel.debugMode}</span>
                          <span className="mutedSmall">{copy.settingsPanel.debugModeHelp}</span>
                        </div>
                        <button
                          id="debug-mode-toggle"
                          className={`settingsSwitch ${debugModeEnabledDraft ? "settingsSwitchActive" : ""}`}
                          onClick={() => setDebugModeEnabledDraft((current) => !current)}
                          type="button"
                          aria-pressed={debugModeEnabledDraft}
                        >
                          <span className="settingsSwitchKnob" />
                        </button>
                      </label>
                      <label className="settingsToggleRow" htmlFor="edge-lines-toggle">
                        <div className="settingsToggleCopy">
                          <span className="fieldLabel">{copy.settingsPanel.edgeLines}</span>
                          <span className="mutedSmall">{copy.settingsPanel.edgeLinesHelp}</span>
                        </div>
                        <button
                          id="edge-lines-toggle"
                          className={`settingsSwitch ${curvedEdgeLinesDraft ? "settingsSwitchActive" : ""}`}
                          onClick={() => setCurvedEdgeLinesDraft((current) => !current)}
                          type="button"
                          aria-pressed={curvedEdgeLinesDraft}
                        >
                          <span className="settingsSwitchKnob" />
                        </button>
                      </label>
                    </div>
                  </section>

                  <section className="settingsPanel settingsPanelWide">
                    <div className="settingsPanelHeader">
                      <div>
                        <div className="settingsPanelEyebrow">{copy.settingsPanel.aiBehavior}</div>
                        <div className="settingsPanelTitle">{copy.settingsPanel.memory}</div>
                      </div>
                    </div>
                    <div className="settingsPanelBody">
                      <div className="settingsLead">
                        {copy.settingsPanel.memoryLead}
                      </div>
                      <div className="thinkingModeSwitch settingsPresetSwitch">
                        {MEMORY_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            className={`thinkingModeChip ${memoryModeDraft === option.id ? "thinkingModeChipActive" : ""}`}
                            onClick={() => setMemoryModeDraft(option.id)}
                            type="button"
                          >
                            <span className="thinkingModeChipLabel">{option.label}</span>
                            <span className="thinkingModeChipTitle">{option.title}</span>
                          </button>
                        ))}
                      </div>
                      <div className="settingsInlineNotice">
                        <strong>{activeMemoryOption.label}</strong>: {activeMemoryValues}
                      </div>
                      {memoryModeDraft === "custom" ? (
                        <>
                          <div className="settingsInlineFields">
                            <label className="field">
                              <span className="fieldLabel">{copy.settingsPanel.memoryHistoryLimit}</span>
                              <input
                                className="input"
                                type="number"
                                min={4}
                                max={120}
                                step={1}
                                value={memoryHistoryLimitDraft}
                                onChange={(event) => setMemoryHistoryLimitDraft(Number(event.target.value) || 4)}
                              />
                            </label>
                          </div>
                          <label className="settingsToggleRow" htmlFor="memory-graph-context-toggle">
                            <div className="settingsToggleCopy">
                              <span className="fieldLabel">{copy.settingsPanel.memoryGraphContext}</span>
                            </div>
                            <button
                              id="memory-graph-context-toggle"
                              className={`settingsSwitch ${memoryIncludeGraphContextDraft ? "settingsSwitchActive" : ""}`}
                              onClick={() => setMemoryIncludeGraphContextDraft((current) => !current)}
                              type="button"
                              aria-pressed={memoryIncludeGraphContextDraft}
                            >
                              <span className="settingsSwitchKnob" />
                            </button>
                          </label>
                          <label className="settingsToggleRow" htmlFor="memory-progress-context-toggle">
                            <div className="settingsToggleCopy">
                              <span className="fieldLabel">{copy.settingsPanel.memoryProgressContext}</span>
                            </div>
                            <button
                              id="memory-progress-context-toggle"
                              className={`settingsSwitch ${memoryIncludeProgressContextDraft ? "settingsSwitchActive" : ""}`}
                              onClick={() => setMemoryIncludeProgressContextDraft((current) => !current)}
                              type="button"
                              aria-pressed={memoryIncludeProgressContextDraft}
                            >
                              <span className="settingsSwitchKnob" />
                            </button>
                          </label>
                          <label className="settingsToggleRow" htmlFor="memory-quiz-context-toggle">
                            <div className="settingsToggleCopy">
                              <span className="fieldLabel">{copy.settingsPanel.memoryQuizContext}</span>
                            </div>
                            <button
                              id="memory-quiz-context-toggle"
                              className={`settingsSwitch ${memoryIncludeQuizContextDraft ? "settingsSwitchActive" : ""}`}
                              onClick={() => setMemoryIncludeQuizContextDraft((current) => !current)}
                              type="button"
                              aria-pressed={memoryIncludeQuizContextDraft}
                            >
                              <span className="settingsSwitchKnob" />
                            </button>
                          </label>
                          <label className="settingsToggleRow" htmlFor="memory-frontier-context-toggle">
                            <div className="settingsToggleCopy">
                              <span className="fieldLabel">{copy.settingsPanel.memoryFrontierContext}</span>
                            </div>
                            <button
                              id="memory-frontier-context-toggle"
                              className={`settingsSwitch ${memoryIncludeFrontierContextDraft ? "settingsSwitchActive" : ""}`}
                              onClick={() => setMemoryIncludeFrontierContextDraft((current) => !current)}
                              type="button"
                              aria-pressed={memoryIncludeFrontierContextDraft}
                            >
                              <span className="settingsSwitchKnob" />
                            </button>
                          </label>
                          <label className="settingsToggleRow" htmlFor="memory-selected-topic-context-toggle">
                            <div className="settingsToggleCopy">
                              <span className="fieldLabel">{copy.settingsPanel.memorySelectedTopicContext}</span>
                            </div>
                            <button
                              id="memory-selected-topic-context-toggle"
                              className={`settingsSwitch ${memoryIncludeSelectedTopicContextDraft ? "settingsSwitchActive" : ""}`}
                              onClick={() => setMemoryIncludeSelectedTopicContextDraft((current) => !current)}
                              type="button"
                              aria-pressed={memoryIncludeSelectedTopicContextDraft}
                            >
                              <span className="settingsSwitchKnob" />
                            </button>
                          </label>
                        </>
                      ) : null}
                    </div>
                  </section>
                </div>

                <div className="settingsSecondaryColumn">
                  {activeGraph ? (
                    <Card className="snapshotsCard settingsSnapshotsCard" title={copy.settingsPanel.snapshots} right={<button className="btn btn-sm" onClick={() => void loadSnapshots()} type="button">{historyLoading ? copy.settingsPanel.refreshing : copy.settingsPanel.refresh}</button>}>
                      <div
                        ref={snapshotsScrollRef}
                        className={`snapshotsScrollContainer stack ${snapshotsScrolledTop ? "snapshotsScrollContainerScrolledTop" : ""} ${snapshotsScrolledBottom ? "snapshotsScrollContainerScrolledBottom" : ""}`}
                      >
                        {historyError ? <div className="inlineNotice inlineNoticeError">{historyError}</div> : null}
                        {snapshots.length > 0 ? (
                          <div className="list">
                            {snapshots.map((snapshot) => (
                              <div key={snapshot.id} className="listItem">
                                <div className="listMain">
                                  <div className="listTitle">{copy.settingsPanel.snapshotLabel(snapshot.id)}</div>
                                  <div className="mutedSmall">
                                    {snapshot.source}
                                    {snapshot.reason ? ` · ${snapshot.reason}` : ""}
                                  </div>
                                </div>
                                <div className="listActions">
                                  {data?.snapshot.id === snapshot.id ? <span className="badge badge-blue">{copy.settingsPanel.current}</span> : null}
                                  {data?.snapshot.id !== snapshot.id ? (
                                    <button className="btn btn-sm" onClick={() => void rollbackSnapshot(snapshot.id)} type="button">
                                      {copy.settingsPanel.rollback}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="muted">{copy.settingsPanel.noSnapshots}</div>
                        )}
                      </div>
                    </Card>
                  ) : null}

                  <section className="settingsPanel">
                    <div className="settingsPanelHeader">
                      <div>
                        <div className="settingsPanelEyebrow">{copy.settingsPanel.closureQuiz}</div>
                        <div className="settingsPanelTitle">{copy.settingsPanel.assessmentThreshold}</div>
                      </div>
                    </div>
                    <div className="settingsPanelBody">
                      <label className="settingsToggleRow" htmlFor="closure-tests-toggle">
                        <div className="settingsToggleCopy">
                          <span className="fieldLabel">{copy.settingsPanel.enableClosureTests}</span>
                          <span className="mutedSmall">{copy.settingsPanel.enableClosureTestsHelp}</span>
                        </div>
                        <button
                          id="closure-tests-toggle"
                          className={`settingsSwitch ${enableClosureTestsDraft ? "settingsSwitchActive" : ""}`}
                          onClick={() => setEnableClosureTestsDraft((current) => !current)}
                          type="button"
                          aria-pressed={enableClosureTestsDraft}
                        >
                          <span className="settingsSwitchKnob" />
                        </button>
                      </label>
                      <div className="settingsInlineFields">
                        <label className="field">
                          <span className="fieldLabel">{copy.settingsPanel.questionsPerQuiz}</span>
                          <select
                            className="input"
                            value={quizQuestionCountDraft}
                            onChange={(event) => setQuizQuestionCountDraft(Number(event.target.value))}
                          >
                            {Array.from({ length: 7 }, (_, index) => index + 6).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="fieldLabel">{copy.settingsPanel.correctAnswersRequired}</span>
                          <select
                            className="input"
                            value={quizPassCountDraft}
                            onChange={(event) => setQuizPassCountDraft(Math.min(Number(event.target.value), quizQuestionCountDraft))}
                          >
                            {Array.from({ length: quizQuestionCountDraft }, (_, index) => index + 1).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="settingsInlineNotice">
                        {copy.settingsPanel.closureRule(quizPassCountDraft, quizQuestionCountDraft)}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
          <div className="settingsFooterBar">
            <button
              className="assistantSendButton"
              disabled={configSaving || !currentConfig || !settingsDirty}
              onClick={saveSettings}
              type="button"
            >
              {configSaving ? copy.settingsPanel.saving : copy.settingsPanel.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
