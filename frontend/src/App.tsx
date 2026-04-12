import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AppDialogs } from "./components/AppDialogs";
import { DebugLogsModal } from "./components/DebugLogsModal";
import { SettingsModal } from "./components/SettingsModal";
import { WorkspaceShell } from "./components/WorkspaceShell";
import type { TopicAnchorPoint } from "./components/GraphCanvas";
import { API_BASE } from "./lib/api";
import { APP_COPY } from "./lib/appCopy";
import { setDebugModeEnabled } from "./lib/debugLogs";
import {
  ASSISTANT_COLLAPSE_THRESHOLD,
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  ASSISTANT_WIDTH_STORAGE_KEY,
  MEMORY_MODE_OPTIONS,
  THINKING_MODE_OPTIONS,
  type AuthSessionPayload,
  type GraphChatState,
  type MemoryMode,
  type ThemeMode,
  type ThinkingMode,
  type WorkspaceSurfacePayload,
} from "./lib/appContracts";
import {
  apiFetch,
  computePopoverPosition,
  makeMessageId,
  type ManualLayoutPositions,
  readErrorMessage,
  readManualLayoutPositions,
  renderDisplayText,
  requiredCorrectAnswers,
  samePopoverPosition,
  shouldCommitAnchorUpdate,
  shouldKeepCurrentAnchor,
  type PopoverPosition,
} from "./lib/appUiHelpers";
import { fetchChatSessions, markChatProposalApplied } from "./lib/chatRequests";
import {
  buildFallbackAssessment,
  computeClosureStatus,
  computeFocusData,
  computeGraphSummary,
  firstProposedTopicId,
  recentMessagesForContext,
  summarizePreviewCounts,
  summarizeTopOperations,
  templatePrompt,
} from "./lib/graph";
import { useModalAccessibility } from "./lib/useModalAccessibility";
import type {
  Artifact,
  ChatMessage,
  ChatSessionSummary,
  CreateGraphRequest,
  GraphEnvelope,
  GraphAssessment,
  GraphChatStreamEvent,
  GraphChatThread,
  GraphExportPackagePayload,
  ProposalGenerateResponse,
  QuizQuestionReview,
  QuizStartResponse,
  QuizSubmitResponse,
  DebugLogSnapshot,
  SnapshotRecord,
  Topic,
  TopicQuizSession,
  WorkspaceEnvelope,
} from "./lib/types";

const VIEWPORT_CENTERED_ZOOM_STORAGE_KEY = "knowledge_graph_viewport_centered_zoom_v1";
const COMPACT_TOP_OVERLAY_THRESHOLD = 960;
const ACTIVE_CHAT_SESSION_STORAGE_KEY = "knowledge_graph_active_chat_session_v1";
const THEME_MODE_STORAGE_KEY = "knowledge_graph_theme_mode_v1";
const MOBILE_LAYOUT_BREAKPOINT = 1180;

function activeChatSessionStorageKey(graphId: string): string {
  return `${ACTIVE_CHAT_SESSION_STORAGE_KEY}:${graphId}`;
}

function readStoredActiveChatSession(graphId: string): string | null {
  try {
    const raw = localStorage.getItem(activeChatSessionStorageKey(graphId));
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

function messagesEquivalent(left: ChatMessage, right: ChatMessage): boolean {
  return left.role === right.role && left.content === right.content && (left.hidden ?? false) === (right.hidden ?? false);
}

function serverThreadIsStaleSubset(serverMessages: ChatMessage[], localMessages: ChatMessage[]): boolean {
  if (serverMessages.length >= localMessages.length) return false;
  let localIndex = 0;
  for (const serverMessage of serverMessages) {
    while (localIndex < localMessages.length && !messagesEquivalent(localMessages[localIndex], serverMessage)) {
      localIndex += 1;
    }
    if (localIndex >= localMessages.length) return false;
    localIndex += 1;
  }
  return true;
}

function reconcileThreadMessages(serverMessages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  if (localMessages.length === 0) return serverMessages;
  if (serverMessages.length === 0) return localMessages;
  if (serverThreadIsStaleSubset(serverMessages, localMessages)) return localMessages;
  return serverMessages;
}

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

export default function App(): React.JSX.Element {
  const [data, setData] = useState<WorkspaceEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<GraphAssessment | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [createGraphDraft, setCreateGraphDraft] = useState<CreateGraphRequest>({
    title: "",
    subject: "",
    language: "en",
    description: "",
  });
  const [createGraphOpen, setCreateGraphOpen] = useState(false);
  const [createGraphLoading, setCreateGraphLoading] = useState(false);
  const [createGraphError, setCreateGraphError] = useState<string | null>(null);
  const [importGraphOpen, setImportGraphOpen] = useState(false);
  const [importGraphLoading, setImportGraphLoading] = useState(false);
  const [importGraphError, setImportGraphError] = useState<string | null>(null);
  const [importGraphFileName, setImportGraphFileName] = useState<string | null>(null);
  const [importGraphPayload, setImportGraphPayload] = useState<GraphExportPackagePayload | null>(null);
  const [importGraphTitleDraft, setImportGraphTitleDraft] = useState("");
  const [importGraphIncludeProgressDraft, setImportGraphIncludeProgressDraft] = useState(true);
  const [exportGraphTarget, setExportGraphTarget] = useState<GraphEnvelope | null>(null);
  const [exportGraphLoading, setExportGraphLoading] = useState(false);
  const [exportGraphError, setExportGraphError] = useState<string | null>(null);
  const [exportGraphTitleDraft, setExportGraphTitleDraft] = useState("");
  const [exportGraphIncludeProgressDraft, setExportGraphIncludeProgressDraft] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ graphId: string; title: string } | null>(null);
  const [sessionDeleteConfirm, setSessionDeleteConfirm] = useState<{ sessionId: string; title: string } | null>(null);
  const [graphLayoutEditing, setGraphLayoutEditing] = useState(false);
  const [graphLayoutDraft, setGraphLayoutDraft] = useState<ManualLayoutPositions | null>(null);
  const [graphLayoutSaving, setGraphLayoutSaving] = useState(false);
  const [renamingGraphId, setRenamingGraphId] = useState<string | null>(null);
  const [renameGraphDraft, setRenameGraphDraft] = useState("");
  const [renameGraphSaving, setRenameGraphSaving] = useState(false);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopicAnchor, setSelectedTopicAnchor] = useState<TopicAnchorPoint | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const [popoverDragOffset, setPopoverDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [chatByGraph, setChatByGraph] = useState<Record<string, GraphChatState>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const [chatThreadLoading, setChatThreadLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSessionsError, setChatSessionsError] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [applyLoadingMessageId, setApplyLoadingMessageId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [assistantWidth, setAssistantWidth] = useState<number>(390);
  const [assistantResizing, setAssistantResizing] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarClosing, setLeftSidebarClosing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isLogsOpen, setLogsOpen] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
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
  const [quizSession, setQuizSession] = useState<TopicQuizSession | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizSuccess, setQuizSuccess] = useState<string | null>(null);
  const [quizReviews, setQuizReviews] = useState<QuizQuestionReview[] | null>(null);
  const [sessionInfo, setSessionInfo] = useState<AuthSessionPayload | null>(null);
  const [workspaceSurface, setWorkspaceSurface] = useState<WorkspaceSurfacePayload | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogSnapshot | null>(null);
  const [debugLogsLoading, setDebugLogsLoading] = useState(false);
  const [debugLogsError, setDebugLogsError] = useState<string | null>(null);
  const [composerUseGrounding, setComposerUseGrounding] = useState(true);
  const [viewportCenteredZoom, setViewportCenteredZoom] = useState(false);
  const [themeModeDraft, setThemeModeDraft] = useState<ThemeMode>(readInitialThemeMode);
  const graphShellRef = useRef<HTMLDivElement | null>(null);
  const topicPopoverRef = useRef<HTMLDivElement | null>(null);
  const deleteGraphModalRef = useRef<HTMLDivElement | null>(null);
  const deleteGraphCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const sessionDeleteModalRef = useRef<HTMLDivElement | null>(null);
  const sessionDeleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const createGraphModalRef = useRef<HTMLDivElement | null>(null);
  const createGraphTitleInputRef = useRef<HTMLInputElement | null>(null);
  const importGraphModalRef = useRef<HTMLDivElement | null>(null);
  const importGraphFileButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportGraphModalRef = useRef<HTMLDivElement | null>(null);
  const exportGraphTitleInputRef = useRef<HTMLInputElement | null>(null);
  const importGraphFileInputRef = useRef<HTMLInputElement | null>(null);
  const quizModalRef = useRef<HTMLDivElement | null>(null);
  const quizCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const popoverDragRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionListRef = useRef<HTMLDivElement | null>(null);
  const sessionListWrapRef = useRef<HTMLDivElement | null>(null);
  const floatingStatsRef = useRef<HTMLDivElement | null>(null);
  const sessionDragRef = useRef<{ startX: number; scrollLeft: number } | null>(null);
  const bootstrapStartedRef = useRef(false);
  const composerGroundingSeededRef = useRef(false);
  const sidebarCloseTimerRef = useRef<number | null>(null);
  const closeDeleteGraphModal = useCallback(() => setDeleteConfirm(null), []);
  const closeSessionDeleteModal = useCallback(() => setSessionDeleteConfirm(null), []);
  const closeCreateGraphModal = useCallback(() => {
    setCreateGraphOpen(false);
    setCreateGraphError(null);
  }, []);
  const closeImportGraphModal = useCallback(() => {
    setImportGraphOpen(false);
    setImportGraphError(null);
    setImportGraphPayload(null);
    setImportGraphFileName(null);
    setImportGraphTitleDraft("");
    setImportGraphIncludeProgressDraft(true);
  }, []);
  const closeExportGraphModal = useCallback(() => {
    setExportGraphTarget(null);
    setExportGraphError(null);
    setExportGraphLoading(false);
    setExportGraphTitleDraft("");
    setExportGraphIncludeProgressDraft(true);
  }, []);
  const openImportGraphModal = useCallback(() => {
    setCreateGraphOpen(false);
    setImportGraphOpen(true);
    setImportGraphError(null);
  }, []);
  const openExportGraphModal = useCallback((graph: GraphEnvelope) => {
    setExportGraphTarget(graph);
    setExportGraphTitleDraft(graph.title);
    setExportGraphIncludeProgressDraft(true);
    setExportGraphError(null);
  }, []);
  const closeQuizModal = useCallback(() => {
    setQuizSession(null);
    setQuizError(null);
  }, []);

  useModalAccessibility({
    isOpen: Boolean(deleteConfirm),
    modalRef: deleteGraphModalRef,
    onClose: closeDeleteGraphModal,
    initialFocusRef: deleteGraphCancelButtonRef,
  });
  useModalAccessibility({
    isOpen: Boolean(sessionDeleteConfirm),
    modalRef: sessionDeleteModalRef,
    onClose: closeSessionDeleteModal,
    initialFocusRef: sessionDeleteCancelButtonRef,
  });
  useModalAccessibility({
    isOpen: createGraphOpen,
    modalRef: createGraphModalRef,
    onClose: closeCreateGraphModal,
    initialFocusRef: createGraphTitleInputRef,
  });
  useModalAccessibility({
    isOpen: importGraphOpen,
    modalRef: importGraphModalRef,
    onClose: closeImportGraphModal,
    initialFocusRef: importGraphFileButtonRef,
  });
  useModalAccessibility({
    isOpen: Boolean(exportGraphTarget),
    modalRef: exportGraphModalRef,
    onClose: closeExportGraphModal,
    initialFocusRef: exportGraphTitleInputRef,
  });
  useModalAccessibility({
    isOpen: Boolean(quizSession),
    modalRef: quizModalRef,
    onClose: closeQuizModal,
    initialFocusRef: quizCloseButtonRef,
  });

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchWorkspace();
        setData(payload);
        const fallbackGraphId = payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null;
        setActiveGraphId((previous) => previous ?? fallbackGraphId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : copy.errors.loadWorkspace);
      } finally {
        setLoading(false);
      }
    }
    void load();
    void loadSnapshots();
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarCloseTimerRef.current) {
        window.clearTimeout(sidebarCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ASSISTANT_WIDTH_STORAGE_KEY);
      if (!saved) return;
      const width = Number.parseInt(saved, 10);
      if (Number.isFinite(width)) {
        const normalized = Math.max(0, Math.min(ASSISTANT_MAX_WIDTH, width));
        setAssistantWidth(normalized < ASSISTANT_MIN_WIDTH ? 0 : normalized);
      }
    } catch {
      // Ignore invalid persisted width values.
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEWPORT_CENTERED_ZOOM_STORAGE_KEY);
      if (saved === "1") setViewportCenteredZoom(true);
      else if (saved === "0") setViewportCenteredZoom(false);
    } catch {
      // Ignore invalid persisted zoom values.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_BREAKPOINT}px)`);
    const sync = () => {
      setIsMobileViewport(media.matches);
      setViewportWidth(window.innerWidth);
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const wasMobileViewportRef = useRef(false);

  useEffect(() => {
    if (wasMobileViewportRef.current && !isMobileViewport) {
      setLeftSidebarOpen(true);
      setLeftSidebarClosing(false);
      setAssistantWidth((current) => (current < ASSISTANT_MIN_WIDTH ? 390 : current));
    }
    wasMobileViewportRef.current = isMobileViewport;
  }, [isMobileViewport]);

  useEffect(() => {
    try {
      localStorage.setItem(ASSISTANT_WIDTH_STORAGE_KEY, String(assistantWidth));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [assistantWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEWPORT_CENTERED_ZOOM_STORAGE_KEY, viewportCenteredZoom ? "1" : "0");
    } catch {
      // Ignore localStorage write failures.
    }
  }, [viewportCenteredZoom]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, themeModeDraft);
    } catch {
      // Ignore localStorage write failures.
    }
    document.documentElement.dataset.theme = themeModeDraft;
  }, [themeModeDraft]);

  const availableGraphs = useMemo(() => data?.workspace.graphs ?? [], [data]);
  const activeGraph = useMemo(
    () => availableGraphs.find((graph) => graph.graph_id === activeGraphId) ?? availableGraphs[0] ?? null,
    [activeGraphId, availableGraphs],
  );
  const activeGraphManualLayout = useMemo(() => readManualLayoutPositions(activeGraph), [activeGraph]);
  const currentChatState = useMemo<GraphChatState>(
    () => {
      if (!activeGraph) return { input: "", messages: [] };
      const stateKey = `${activeGraph.graph_id}:${activeSessionId ?? "general"}`;
      return chatByGraph[stateKey] ?? { input: "", messages: [] };
    },
    [activeGraph, chatByGraph, activeSessionId],
  );

  useEffect(() => {
    if (!activeGraph?.graph_id) return;
    try {
      if (activeSessionId) {
        localStorage.setItem(activeChatSessionStorageKey(activeGraph.graph_id), activeSessionId);
      } else {
        localStorage.removeItem(activeChatSessionStorageKey(activeGraph.graph_id));
      }
    } catch {
      // Ignore localStorage write failures.
    }
  }, [activeGraph?.graph_id, activeSessionId]);

  useEffect(() => {
    if (!activeGraph) {
      setSelectedTopicId(null);
      setSelectedTopicAnchor(null);
      return;
    }
    setSelectedTopicId((previous) => {
      const stillExists = activeGraph.topics.some((topic) => topic.id === previous);
      return stillExists ? previous : null;
    });
  }, [activeGraph]);

  useEffect(() => {
    setQuizSuccess(null);
  }, [selectedTopicId]);

  useEffect(() => {
    setApplyError(null);
    setQuizSession(null);
    setQuizAnswers({});
    setQuizError(null);
    setQuizSuccess(null);
    setQuizReviews(null);
    setGraphLayoutEditing(false);
    setGraphLayoutDraft(null);
  }, [activeGraph?.graph_id]);

  useEffect(() => {
    const c = data?.workspace.config;
    if (!c) return;
    setProviderDraft(c.ai_provider ?? "gemini");
    setModelDraft(c.default_model);
    setModelPresetDraft(c.model_options.includes(c.default_model) ? c.default_model : "__custom__");
    setGeminiApiKeyDraft(c.gemini_api_key ?? "");
    setOpenaiApiKeyDraft(c.openai_api_key ?? "");
    setOpenaiBaseUrlDraft(c.openai_base_url ?? "https://api.openai.com/v1");
    setShowOpenAIEndpointDraft((c.openai_base_url ?? "https://api.openai.com/v1") !== "https://api.openai.com/v1" || c.openai_base_url_source === "env");
    setPersonaDraft(c.persona_rules ?? "");
    setThinkingModeDraft(c.thinking_mode ?? "default");
    setMemoryModeDraft(c.memory_mode ?? "balanced");
    setPlannerMaxTokensDraft(c.planner_max_output_tokens);
    setPlannerThinkingBudgetDraft(c.planner_thinking_budget);
    setOrchestratorMaxTokensDraft(c.orchestrator_max_output_tokens);
    setQuizMaxTokensDraft(c.quiz_max_output_tokens);
    setAssistantMaxTokensDraft(c.assistant_max_output_tokens);
    setDisableIdleAnimationsDraft(c.disable_idle_animations ?? false);
    setEnableClosureTestsDraft(c.enable_closure_tests ?? true);
    setDebugModeEnabledDraft(c.debug_mode_enabled ?? false);
    setMemoryHistoryLimitDraft(c.memory_history_message_limit ?? 32);
    setMemoryIncludeGraphContextDraft(c.memory_include_graph_context ?? true);
    setMemoryIncludeProgressContextDraft(c.memory_include_progress_context ?? true);
    setMemoryIncludeQuizContextDraft(c.memory_include_quiz_context ?? true);
    setMemoryIncludeFrontierContextDraft(c.memory_include_frontier_context ?? true);
    setMemoryIncludeSelectedTopicContextDraft(c.memory_include_selected_topic_context ?? true);
    setQuizQuestionCountDraft(c.quiz_question_count);
    setQuizPassCountDraft(requiredCorrectAnswers(c.pass_threshold, c.quiz_question_count));
  }, [data?.workspace.config]);

  useEffect(() => {
    if (!isMobileViewport) return;
    setLeftSidebarOpen(false);
    setLeftSidebarClosing(false);
    setAssistantWidth(0);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || activeGraph) return;
    setAssistantWidth(0);
  }, [activeGraph, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileMenuOpen(false);
      return;
    }
    if (isSettingsOpen) {
      setMobileMenuOpen(false);
    }
  }, [isMobileViewport, isSettingsOpen]);

  useEffect(() => {
    setQuizPassCountDraft((current) => Math.min(current, quizQuestionCountDraft));
  }, [quizQuestionCountDraft]);

  useEffect(() => {
    let cancelled = false;
    async function loadChatThread(graphId: string): Promise<void> {
      setChatThreadLoading(true);
      setChatError(null);
      try {
        const sessionParam = activeSessionId ? `?session_id=${activeSessionId}` : "";
        const response = await apiFetch(`${API_BASE}/api/v1/graphs/${graphId}/chat${sessionParam}`);
        if (!response.ok) {
          if (response.status === 404 && activeSessionId) {
            setActiveSessionId(null);
            return;
          }
          throw new Error(`chat thread failed with ${response.status}`);
        }
        const payload = (await response.json()) as GraphChatThread;
        if (cancelled) return;
        setChatByGraph((current) => {
          const stateKey = `${graphId}:${activeSessionId ?? "general"}`;
          const existing = current[stateKey] ?? { input: "", messages: [] };
          return {
            ...current,
            [stateKey]: {
              input: existing.input,
              messages: reconcileThreadMessages(payload.messages, existing.messages),
            },
          };
        });
      } catch (loadError) {
        if (cancelled) return;
        setChatError(loadError instanceof Error ? loadError.message : copy.errors.loadChat);
      } finally {
        if (!cancelled) setChatThreadLoading(false);
      }
    }

    if (!activeGraph?.graph_id) return;
    void loadChatThread(activeGraph.graph_id);
    return () => {
      cancelled = true;
    };
  }, [activeGraph?.graph_id, activeSessionId]);

  const selectedTopic: Topic | null = useMemo(() => {
    if (!activeGraph || !selectedTopicId) return null;
    return activeGraph.topics.find((topic) => topic.id === selectedTopicId) ?? null;
  }, [activeGraph, selectedTopicId]);

  const focusData = useMemo(() => computeFocusData(activeGraph, selectedTopicId), [activeGraph, selectedTopicId]);
  const graphSummary = useMemo(() => computeGraphSummary(activeGraph), [activeGraph]);
  const fallbackAssessment = useMemo(() => buildFallbackAssessment(activeGraph), [activeGraph]);
  const zoneTitlesById = useMemo(() => new Map((activeGraph?.zones ?? []).map((zone) => [zone.id, zone.title])), [activeGraph]);
  const topicTitlesById = useMemo(() => new Map((activeGraph?.topics ?? []).map((topic) => [topic.id, topic.title])), [activeGraph]);
  const selectedZoneTitles = useMemo(
    () => (selectedTopic?.zones ?? []).map((zoneId) => zoneTitlesById.get(zoneId) ?? zoneId),
    [selectedTopic, zoneTitlesById],
  );
  const selectedZoneLabel = selectedZoneTitles.join(" · ");
  const selectedResourceLinks = useMemo(() => selectedTopic?.resources ?? [], [selectedTopic]);
  const selectedArtifacts = useMemo(() => selectedTopic?.artifacts ?? [], [selectedTopic]);
  const selectedClosureStatus = useMemo(() => computeClosureStatus(activeGraph, selectedTopicId), [activeGraph, selectedTopicId]);
  const activeAssessmentCards = useMemo(
    () => (assessment?.cards.length ? assessment.cards : fallbackAssessment.cards).filter((card) => card.label !== "Roadmap"),
    [assessment?.cards, fallbackAssessment.cards],
  );
  const sessionUser = sessionInfo?.user ?? null;
  const copy = APP_COPY;
  const onboardingNeedsFirstGraph = !activeGraph && workspaceSurface?.onboarding_state === "needs_first_graph";
  const currentConfig = data?.workspace.config ?? null;
  const geminiKeyLockedByEnv = currentConfig?.gemini_api_key_source === "env";
  const openaiKeyLockedByEnv = currentConfig?.openai_api_key_source === "env";
  const openaiBaseUrlLockedByEnv = currentConfig?.openai_base_url_source === "env";
  const liveDisableIdleAnimations =
    isSettingsOpen
      ? disableIdleAnimationsDraft
      : Boolean(currentConfig?.disable_idle_animations);
  const currentQuizPassCount = currentConfig
    ? requiredCorrectAnswers(currentConfig.pass_threshold, currentConfig.quiz_question_count)
    : 0;
  const closureTestsEnabled = currentConfig?.enable_closure_tests ?? true;
  const debugModeEnabled = currentConfig?.debug_mode_enabled ?? false;
  useEffect(() => {
    setDebugModeEnabled(debugModeEnabled);
    if (!debugModeEnabled) {
      setLogsOpen(false);
    }
  }, [debugModeEnabled]);
  const activeThinkingOption = THINKING_MODE_OPTIONS.find((option) => option.id === thinkingModeDraft) ?? THINKING_MODE_OPTIONS[1];
  const activeMemoryOption = MEMORY_MODE_OPTIONS.find((option) => option.id === memoryModeDraft) ?? MEMORY_MODE_OPTIONS[1];
  const activeThinkingValues =
    thinkingModeDraft === "custom"
      ? `Planner ${plannerMaxTokensDraft.toLocaleString()} · thinking ${plannerThinkingBudgetDraft.toLocaleString()} · orchestrator ${orchestratorMaxTokensDraft.toLocaleString()} · quiz ${quizMaxTokensDraft.toLocaleString()} · assistant ${assistantMaxTokensDraft.toLocaleString()}`
      : activeThinkingOption.description;
  const activeMemoryValues =
    memoryModeDraft === "custom"
      ? `${memoryHistoryLimitDraft} recent messages · graph ${memoryIncludeGraphContextDraft ? "on" : "off"} · progress ${memoryIncludeProgressContextDraft ? "on" : "off"} · quiz ${memoryIncludeQuizContextDraft ? "on" : "off"} · frontier ${memoryIncludeFrontierContextDraft ? "on" : "off"} · selected topic ${memoryIncludeSelectedTopicContextDraft ? "on" : "off"}`
      : activeMemoryOption.description;
  const settingsDirty = Boolean(
    currentConfig && (
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
      disableIdleAnimationsDraft !== (currentConfig.disable_idle_animations ?? false) ||
      enableClosureTestsDraft !== (currentConfig.enable_closure_tests ?? true) ||
      debugModeEnabledDraft !== (currentConfig.debug_mode_enabled ?? false) ||
      personaDraft !== (currentConfig.persona_rules ?? "") ||
      quizQuestionCountDraft !== currentConfig.quiz_question_count ||
      quizPassCountDraft !== currentQuizPassCount
    )
  );
  const showGraphLoadingState = loading && !activeGraph;
  const showGraphEmptyState = !loading && !activeGraph;

  useEffect(() => {
    if (!selectedTopicId) {
      setSelectedTopicAnchor(null);
      setPopoverPosition(null);
      setPopoverDragOffset({ x: 0, y: 0 });
    }
  }, [selectedTopicId]);

  const selectedTopicAnchorRef = useRef(selectedTopicAnchor);
  selectedTopicAnchorRef.current = selectedTopicAnchor;
  const popoverDragOffsetRef = useRef(popoverDragOffset);
  popoverDragOffsetRef.current = popoverDragOffset;
  const lastAnchorCommitAtRef = useRef(0);
  const handleSelectedTopicAnchorChange = useCallback((next: TopicAnchorPoint | null) => {
    const current = selectedTopicAnchorRef.current;
    if (isMobileViewport && current && next) return;
    if (shouldKeepCurrentAnchor(current, next)) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - lastAnchorCommitAtRef.current;
    if (!shouldCommitAnchorUpdate(current, next, elapsed)) return;
    lastAnchorCommitAtRef.current = now;
    setSelectedTopicAnchor(next);
  }, [isMobileViewport]);

  useLayoutEffect(() => {
    if (!selectedTopic || !selectedTopicAnchor) {
      setPopoverPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = selectedTopicAnchorRef.current;
      if (!anchor) {
        setPopoverPosition(null);
        return;
      }
      const base = computePopoverPosition(anchor, graphShellRef.current, topicPopoverRef.current);
      if (!base) {
        setPopoverPosition(null);
        return;
      }
      const drag = popoverDragOffsetRef.current;
      const next = {
        left: base.left + drag.x,
        top: base.top + drag.y,
        side: base.side,
      } satisfies PopoverPosition;
      setPopoverPosition((current) => (samePopoverPosition(current, next) ? current : next));
    };

    const frame = window.requestAnimationFrame(updatePosition);
    const shell = graphShellRef.current;
    if (!shell) {
      window.cancelAnimationFrame(frame);
      return;
    }

    const resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(shell);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
    // Recreate the observer only when the selected topic changes.
    // Anchor coordinates are read through refs inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopic?.id]);

  // Update the popover position without recreating the observer.
  useEffect(() => {
    if (!selectedTopic || !selectedTopicAnchor) return;
    const base = computePopoverPosition(selectedTopicAnchor, graphShellRef.current, topicPopoverRef.current);
    if (!base) return;
    const next = {
      left: base.left + popoverDragOffset.x,
      top: base.top + popoverDragOffset.y,
      side: base.side,
    } satisfies PopoverPosition;
    setPopoverPosition((current) => (samePopoverPosition(current, next) ? current : next));
  }, [selectedTopic, selectedTopicAnchor, popoverDragOffset]);

  useEffect(() => {
    function stopDrag(): void {
      popoverDragRef.current = null;
    }

    function onPointerMove(event: PointerEvent): void {
      const drag = popoverDragRef.current;
      const shell = graphShellRef.current;
      const popover = topicPopoverRef.current;
      if (!drag || !shell || !popover) return;
      const shellRect = shell.getBoundingClientRect();
      const nextLeft = drag.startX + (event.clientX - drag.pointerX);
      const nextTop = drag.startY + (event.clientY - drag.pointerY);
      const boundedLeft = Math.max(16, Math.min(shellRect.width - popover.offsetWidth - 16, nextLeft));
      const boundedTop = Math.max(16, Math.min(shellRect.height - popover.offsetHeight - 16, nextTop));
      const currentBase = computePopoverPosition(selectedTopicAnchor, shell, popover);
      if (!currentBase) return;
      setPopoverDragOffset({
        x: boundedLeft - currentBase.left,
        y: boundedTop - currentBase.top,
      });
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [selectedTopicAnchor]);

  useEffect(() => {
    let cancelled = false;
    async function loadAssessment(): Promise<void> {
      if (!activeGraph) {
        setAssessment(null);
        setAssessmentError(null);
        return;
      }
      try {
        const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/assessment`);
        if (!response.ok) throw new Error(`assessment failed with ${response.status}`);
        const payload = (await response.json()) as GraphAssessment;
        if (cancelled) return;
        setAssessment(payload);
        setAssessmentError(null);
      } catch (loadError) {
        if (cancelled) return;
        setAssessment(null);
        setAssessmentError(loadError instanceof Error ? loadError.message : copy.errors.loadAssessment);
      }
    }
    void loadAssessment();
    return () => {
      cancelled = true;
    };
  }, [activeGraph?.graph_id, data?.snapshot.id]);

  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [currentChatState.messages, chatLoading]);

  function handleAssistantResize(startX: number): void {
    setAssistantResizing(true);
    const startWidth = assistantWidth;
    let latestWidth = assistantWidth;

    function onMouseMove(event: MouseEvent): void {
      const delta = startX - event.clientX;
      const nextWidth = Math.min(Math.max(0, startWidth + delta), ASSISTANT_MAX_WIDTH);
      latestWidth = nextWidth;
      setAssistantWidth(nextWidth);
    }

    function onMouseUp(): void {
      setAssistantResizing(false);
      setAssistantWidth((current) => {
        const resolved = latestWidth || current;
        if (resolved < ASSISTANT_COLLAPSE_THRESHOLD) return 0;
        return Math.min(ASSISTANT_MAX_WIDTH, Math.max(ASSISTANT_MIN_WIDTH, resolved));
      });
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function updateCurrentChatState(updater: (current: GraphChatState) => GraphChatState): void {
    if (!activeGraph) return;
    const stateKey = `${activeGraph.graph_id}:${activeSessionId ?? "general"}`;
    setChatByGraph((current) => {
      const graphState = current[stateKey] ?? { input: "", messages: [] };
      return {
        ...current,
        [stateKey]: updater(graphState),
      };
    });
  }

  function clearChatStateForGraph(graphId: string | null | undefined): void {
    if (!graphId) return;
    setChatByGraph((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${graphId}:`)) delete next[key];
      }
      return next;
    });
  }

  async function loadSessions(): Promise<void> {
    if (!activeGraph) return;
    setChatSessionsError(null);
    try {
      const sessions = await fetchChatSessions(
        apiFetch,
        `${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/sessions`,
        copy.errors.loadChatSessions,
      );
      setChatSessions(sessions);
    } catch (loadError) {
      setChatSessionsError(loadError instanceof Error ? loadError.message : copy.errors.loadChatSessions);
    }
  }

  // Restore the last active chat session for the selected graph across reloads.
  useEffect(() => {
    setChatSessions([]);
    setChatSessionsError(null);
    if (!activeGraph) return;
    setActiveSessionId(readStoredActiveChatSession(activeGraph.graph_id));
    void loadSessions();
  }, [activeGraph?.graph_id]);

  async function fetchWorkspace(): Promise<WorkspaceEnvelope> {
    const response = await apiFetch(`${API_BASE}/api/v1/workspace/current`);
    if (!response.ok) throw new Error(`backend returned ${response.status}`);
    return (await response.json()) as WorkspaceEnvelope;
  }
  const loadWorkspaceSurface = useCallback(async (): Promise<WorkspaceSurfacePayload | null> => {
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/surface`);
      if (!response.ok) return null;
      const payload = (await response.json()) as WorkspaceSurfacePayload;
      setWorkspaceSurface(payload);
      if (!composerGroundingSeededRef.current) {
        setComposerUseGrounding(payload.grounding_default_enabled);
        composerGroundingSeededRef.current = true;
      }
      return payload;
    } catch {
      return null;
    }
  }, []);

  const loadSessionInfo = useCallback(async (): Promise<AuthSessionPayload | null> => {
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/auth/session`);
      if (!response.ok) return null;
      const payload = (await response.json()) as AuthSessionPayload;
      setSessionInfo(payload);
      if (payload.workspace_surface) {
        setWorkspaceSurface(payload.workspace_surface);
        if (!composerGroundingSeededRef.current) {
          setComposerUseGrounding(payload.workspace_surface.grounding_default_enabled);
          composerGroundingSeededRef.current = true;
        }
      }
      return payload;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void loadSessionInfo();
  }, [loadSessionInfo]);

  async function loadSnapshots(): Promise<void> {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graph/snapshots`);
      if (!response.ok) throw new Error(`snapshot list failed with ${response.status}`);
      const payload = (await response.json()) as { items: SnapshotRecord[] };
      setSnapshots(payload.items);
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : copy.errors.loadHistory);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function createGraph(): Promise<void> {
    setCreateGraphLoading(true);
    setCreateGraphError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createGraphDraft),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? `graph create failed with ${response.status}`);
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      clearChatStateForGraph(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
      await loadSnapshots();
      setActiveGraphId(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
      setSelectedTopicId(null);
      setSelectedTopicAnchor(null);
      setCreateGraphOpen(false);
      setCreateGraphDraft({ title: "", subject: "", language: "en", description: "" });
      await loadSessionInfo();
    } catch (createError) {
      setCreateGraphError(createError instanceof Error ? createError.message : copy.errors.createGraph);
    } finally {
      setCreateGraphLoading(false);
    }
  }

  async function importGraphFromPackage(): Promise<void> {
    if (!importGraphPayload) {
      setImportGraphError(copy.dialogs.noFileChosen);
      return;
    }
    setImportGraphLoading(true);
    setImportGraphError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: importGraphPayload,
          title: importGraphTitleDraft.trim() || undefined,
          include_progress: importGraphIncludeProgressDraft,
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.importGraph));
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      clearChatStateForGraph(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
      setActiveGraphId(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
      setSelectedTopicId(null);
      setSelectedTopicAnchor(null);
      closeImportGraphModal();
      setCreateGraphOpen(false);
      await Promise.all([loadSnapshots(), loadSessionInfo()]);
    } catch (importError) {
      setImportGraphError(importError instanceof Error ? importError.message : copy.errors.importGraph);
    } finally {
      setImportGraphLoading(false);
    }
  }

  async function handleImportGraphFile(file: File): Promise<void> {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as GraphExportPackagePayload;
      if (!parsed || parsed.kind !== "mapmind_graph_export" || !parsed.graph) {
        throw new Error("unsupported graph package");
      }
      setImportGraphPayload(parsed);
      setImportGraphFileName(file.name);
      setImportGraphTitleDraft(parsed.title ?? parsed.graph.title ?? "");
      setImportGraphIncludeProgressDraft(Boolean(parsed.include_progress));
      setImportGraphError(null);
    } catch (parseError) {
      setImportGraphPayload(null);
      setImportGraphFileName(file.name);
      setImportGraphError(parseError instanceof Error ? parseError.message : copy.errors.importGraph);
    }
  }

  async function exportGraph(graph: GraphEnvelope): Promise<void> {
    setExportGraphLoading(true);
    setExportGraphError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${graph.graph_id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: exportGraphTitleDraft.trim() || graph.title,
          include_progress: exportGraphIncludeProgressDraft,
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.exportGraph));
      }
      const payload = (await response.json()) as GraphExportPackagePayload;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeBase = (exportGraphTitleDraft.trim() || graph.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "graph";
      link.href = objectUrl;
      link.download = `${safeBase}.mapmind-graph.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      closeExportGraphModal();
    } catch (exportError) {
      setExportGraphError(exportError instanceof Error ? exportError.message : copy.errors.exportGraph);
    } finally {
      setExportGraphLoading(false);
    }
  }

  async function renameGraph(graphId: string): Promise<void> {
    const nextTitle = renameGraphDraft.trim();
    if (!nextTitle) {
      setError("graph title is required");
      return;
    }
    setRenameGraphSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${graphId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.renameGraph));
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      setActiveGraphId(payload.workspace.active_graph_id ?? graphId);
      setRenamingGraphId(null);
      setRenameGraphDraft("");
      await Promise.all([loadSnapshots(), loadSessionInfo()]);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : copy.errors.renameGraph);
    } finally {
      setRenameGraphSaving(false);
    }
  }

  async function saveGraphLayout(): Promise<void> {
    if (!activeGraph) return;
    if (!graphLayoutDraft || Object.keys(graphLayoutDraft).length === 0) {
      setGraphLayoutEditing(false);
      return;
    }
    setGraphLayoutSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${activeGraph.graph_id}/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: graphLayoutDraft }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.saveGraphLayout));
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      setGraphLayoutEditing(false);
      setGraphLayoutDraft(null);
      void loadSnapshots();
    } catch (layoutError) {
      setError(layoutError instanceof Error ? layoutError.message : copy.errors.saveGraphLayout);
    } finally {
      setGraphLayoutSaving(false);
    }
  }

  function startGraphLayoutEdit(): void {
    setError(null);
    setGraphLayoutDraft(activeGraphManualLayout);
    setGraphLayoutEditing(true);
  }

  async function updateWorkspaceConfig(patch: {
    ai_provider?: string;
    default_model?: string;
    gemini_api_key?: string;
    openai_api_key?: string;
    openai_base_url?: string;
    thinking_mode?: ThinkingMode;
    memory_mode?: MemoryMode;
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
  }): Promise<void> {
    setConfigSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/workspace/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? `config update failed with ${response.status}`);
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      void loadSnapshots();
      void loadWorkspaceSurface();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : copy.errors.updateConfig);
    } finally {
      setConfigSaving(false);
    }
  }

  function saveSettings(): void {
    if (!currentConfig) return;
    const patch: Parameters<typeof updateWorkspaceConfig>[0] = {};
    if (providerDraft !== currentConfig.ai_provider) patch.ai_provider = providerDraft;
    if (modelDraft !== currentConfig.default_model) patch.default_model = modelDraft;
    if (!geminiKeyLockedByEnv && geminiApiKeyDraft !== (currentConfig.gemini_api_key ?? "")) patch.gemini_api_key = geminiApiKeyDraft;
    if (!openaiKeyLockedByEnv && openaiApiKeyDraft !== (currentConfig.openai_api_key ?? "")) patch.openai_api_key = openaiApiKeyDraft;
    if (!openaiBaseUrlLockedByEnv && openaiBaseUrlDraft !== currentConfig.openai_base_url) patch.openai_base_url = openaiBaseUrlDraft;
    if (thinkingModeDraft !== currentConfig.thinking_mode) patch.thinking_mode = thinkingModeDraft;
    if (memoryModeDraft !== (currentConfig.memory_mode ?? "balanced")) patch.memory_mode = memoryModeDraft;
    if (thinkingModeDraft === "custom") {
      if (plannerMaxTokensDraft !== currentConfig.planner_max_output_tokens) patch.planner_max_output_tokens = plannerMaxTokensDraft;
      if (plannerThinkingBudgetDraft !== currentConfig.planner_thinking_budget) patch.planner_thinking_budget = plannerThinkingBudgetDraft;
      if (orchestratorMaxTokensDraft !== currentConfig.orchestrator_max_output_tokens) patch.orchestrator_max_output_tokens = orchestratorMaxTokensDraft;
      if (quizMaxTokensDraft !== currentConfig.quiz_max_output_tokens) patch.quiz_max_output_tokens = quizMaxTokensDraft;
      if (assistantMaxTokensDraft !== currentConfig.assistant_max_output_tokens) patch.assistant_max_output_tokens = assistantMaxTokensDraft;
    }
    if (memoryModeDraft === "custom") {
      if (memoryHistoryLimitDraft !== (currentConfig.memory_history_message_limit ?? 32)) patch.memory_history_message_limit = memoryHistoryLimitDraft;
      if (memoryIncludeGraphContextDraft !== (currentConfig.memory_include_graph_context ?? true)) patch.memory_include_graph_context = memoryIncludeGraphContextDraft;
      if (memoryIncludeProgressContextDraft !== (currentConfig.memory_include_progress_context ?? true)) patch.memory_include_progress_context = memoryIncludeProgressContextDraft;
      if (memoryIncludeQuizContextDraft !== (currentConfig.memory_include_quiz_context ?? true)) patch.memory_include_quiz_context = memoryIncludeQuizContextDraft;
      if (memoryIncludeFrontierContextDraft !== (currentConfig.memory_include_frontier_context ?? true)) patch.memory_include_frontier_context = memoryIncludeFrontierContextDraft;
      if (memoryIncludeSelectedTopicContextDraft !== (currentConfig.memory_include_selected_topic_context ?? true)) patch.memory_include_selected_topic_context = memoryIncludeSelectedTopicContextDraft;
    }
    if (disableIdleAnimationsDraft !== (currentConfig.disable_idle_animations ?? false)) {
      patch.disable_idle_animations = disableIdleAnimationsDraft;
    }
    if (enableClosureTestsDraft !== (currentConfig.enable_closure_tests ?? true)) {
      patch.enable_closure_tests = enableClosureTestsDraft;
    }
    if (debugModeEnabledDraft !== (currentConfig.debug_mode_enabled ?? false)) {
      patch.debug_mode_enabled = debugModeEnabledDraft;
    }
    if (personaDraft !== (currentConfig.persona_rules ?? "")) patch.persona_rules = personaDraft;
    if (quizQuestionCountDraft !== currentConfig.quiz_question_count) patch.quiz_question_count = quizQuestionCountDraft;
    if (quizPassCountDraft !== currentQuizPassCount || quizQuestionCountDraft !== currentConfig.quiz_question_count) {
      patch.pass_threshold = quizPassCountDraft / quizQuestionCountDraft;
    }
    if (Object.keys(patch).length > 0) void updateWorkspaceConfig(patch);
  }

  async function sendChat(
    overridePrompt?: string,
    options?: { hiddenUserMessage?: boolean; baseMessages?: ChatMessage[] },
  ): Promise<void> {
    if (!activeGraph) return;
    const prompt = (overridePrompt ?? currentChatState.input).trim();
    if (!prompt) return;
    const hiddenUserMessage = options?.hiddenUserMessage ?? false;
    const baseMessages = options?.baseMessages ?? currentChatState.messages;

    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: "user",
      content: prompt,
      hidden: hiddenUserMessage,
      created_at: new Date().toISOString(),
    };
    const nextMessages = [...baseMessages, userMessage];
    updateCurrentChatState(() => ({ input: "", messages: nextMessages }));
    setChatLoading(true);
    setChatError(null);

    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          messages: recentMessagesForContext(nextMessages, currentConfig?.memory_history_message_limit ?? 50).map((message) => ({
            role: message.role,
            content: message.content,
            hidden: message.hidden ?? false,
            created_at: message.created_at,
          })),
          hidden_user_message: hiddenUserMessage,
          selected_topic_id: activeSessionId
            ? chatSessions.find((s) => s.session_id === activeSessionId)?.topic_id ?? selectedTopicId
            : selectedTopicId,
          session_id: activeSessionId,
          model: data?.workspace.config.default_model ?? null,
          use_grounding: composerUseGrounding,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? `chat failed with ${response.status}`);
      }
      if (!response.body) throw new Error("chat stream unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as GraphChatStreamEvent;
          if (event.type === "assistant_message") {
            const terminalAssistantMessage =
              event.message ?? (event.messages && event.messages.length > 0 ? event.messages[event.messages.length - 1] : null);
            updateCurrentChatState((current) => ({
              ...current,
              messages: [...current.messages, event.message],
            }));
            if (terminalAssistantMessage?.action === "answer") {
              setChatLoading(false);
            }
            continue;
          }
          if (event.type === "planning_status") {
            updateCurrentChatState((current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === event.message_id
                  ? { ...message, planning_status: event.label, planning_error: null }
                  : message,
              ),
            }));
            continue;
          }
          if (event.type === "proposal_ready") {
            setChatLoading(false);
            updateCurrentChatState((current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === event.message_id
                  ? { ...(event.message ?? message), planning_status: null, planning_error: null }
                  : message,
              ),
            }));
            continue;
          }
          if (event.type === "planning_error") {
            setChatLoading(false);
            updateCurrentChatState((current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === event.message_id
                  ? { ...message, planning_status: null, planning_error: event.detail }
                  : message,
              ),
            }));
            continue;
          }
          if (event.type === "error") {
            throw new Error(event.detail);
          }
        }
      }
    } catch (chatLoadError) {
      setChatError(chatLoadError instanceof Error ? chatLoadError.message : "chat failed");
      updateCurrentChatState((current) => ({
        ...current,
        input: prompt,
        messages: current.messages.filter((message) => message.id !== userMessage.id),
      }));
    } finally {
      setChatLoading(false);
      void loadSessions();
    }
  }

  async function applyProposalFromMessage(messageId: string, proposal: ProposalGenerateResponse): Promise<void> {
    if (!activeGraph) return;
    setApplyLoadingMessageId(messageId);
    setApplyError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal.proposal_envelope),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.applyProposal));
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      const proposedTopicId = firstProposedTopicId(proposal);
      // Commit the graph transition in one synchronous block to avoid visible intermediate states.
      setData(payload);
      setActiveGraphId(proposal.proposal_envelope.graph_id);
      if (proposedTopicId) {
        setSelectedTopicId(proposedTopicId);
        setSelectedTopicAnchor(null);
      }
      // Snapshot refresh should not block the main graph transition.
      void loadSnapshots();
      try {
        const sessionParam = activeSessionId ? `?session_id=${encodeURIComponent(activeSessionId)}` : "";
        const thread = await markChatProposalApplied(
          apiFetch,
          `${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/messages/${messageId}/applied${sessionParam}`,
          copy.errors.syncAppliedProposal,
        );
        updateCurrentChatState((current) => ({
          ...current,
          messages: thread.messages,
        }));
        setApplyError(null);
      } catch (syncError) {
        setApplyError(syncError instanceof Error ? syncError.message : copy.errors.syncAppliedProposal);
      }
    } catch (applyLoadError) {
      setApplyError(applyLoadError instanceof Error ? applyLoadError.message : copy.errors.applyProposal);
    } finally {
      setApplyLoadingMessageId(null);
    }
  }

  async function startQuiz(): Promise<void> {
    if (!activeGraph || !selectedTopic) return;
    setQuizLoading(true);
    setQuizError(null);
    setQuizSuccess(null);
    setQuizReviews(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/topics/${selectedTopic.id}/quiz/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: data?.workspace.config.default_model ?? null }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.startQuiz));
      }
      const payload = (await response.json()) as QuizStartResponse;
      setQuizSession(payload.session);
      setQuizAnswers({});
    } catch (quizLoadError) {
      setQuizError(quizLoadError instanceof Error ? quizLoadError.message : copy.errors.startQuiz);
    } finally {
      setQuizLoading(false);
    }
  }

  async function markTopicFinished(): Promise<void> {
    if (!activeGraph || !selectedTopic) return;
    setQuizLoading(true);
    setQuizError(null);
    setQuizSuccess(null);
    setQuizReviews(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/topics/${selectedTopic.id}/mark-finished`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.submitQuiz));
      }
      const payload = (await response.json()) as QuizSubmitResponse;
      setData(payload.workspace);
      void loadSnapshots();
      setQuizSession(null);
      setQuizAnswers({});
      setQuizSuccess(copy.closure.markAsFinished);
    } catch (markError) {
      setQuizError(markError instanceof Error ? markError.message : copy.errors.submitQuiz);
    } finally {
      setQuizLoading(false);
    }
  }

  async function addTopicResource(topicId: string, url: string): Promise<void> {
    if (!activeGraph) return;
    const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${activeGraph.graph_id}/topics/${topicId}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, copy.dialogs.addResourceTitle));
    }
    const payload = (await response.json()) as WorkspaceEnvelope;
    setData(payload);
    await loadSnapshots();
  }

  async function addTopicArtifact(topicId: string, title: string, body: string): Promise<void> {
    if (!activeGraph) return;
    const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${activeGraph.graph_id}/topics/${topicId}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() }),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, copy.dialogs.addArtifactTitle));
    }
    const payload = (await response.json()) as WorkspaceEnvelope;
    setData(payload);
    await loadSnapshots();
  }

  async function submitQuiz(): Promise<void> {
    if (!activeGraph || !selectedTopic || !quizSession) return;
    setQuizLoading(true);
    setQuizError(null);
    setQuizSuccess(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/topics/${selectedTopic.id}/quiz/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: quizSession.session_id,
          answers: quizSession.questions.map((question) => ({
            question_id: question.id,
            choice_index: quizAnswers[question.id] ?? -1,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.submitQuiz));
      }
      const payload = (await response.json()) as QuizSubmitResponse;
      setData(payload.workspace);
      void loadSnapshots();
      setQuizAnswers({});
      setQuizReviews(payload.reviews);
      if (payload.attempt.passed) {
        setQuizSuccess(copy.quiz.correct);
      }
    } catch (quizSubmitError) {
      setQuizError(quizSubmitError instanceof Error ? quizSubmitError.message : copy.errors.submitQuiz);
    } finally {
      setQuizLoading(false);
    }
  }

  async function rollbackSnapshot(snapshotId: number): Promise<void> {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/graph/rollback/${snapshotId}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, copy.errors.rollbackSnapshot));
      }
      const payload = (await response.json()) as WorkspaceEnvelope;
      setData(payload);
      setActiveGraphId(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
      setSelectedTopicId(null);
      setSelectedTopicAnchor(null);
      setQuizSession(null);
      setQuizReviews(null);
      await loadSnapshots();
    } catch (rollbackError) {
      setHistoryError(rollbackError instanceof Error ? rollbackError.message : copy.errors.rollbackSnapshot);
    } finally {
      setHistoryLoading(false);
    }
  }

  const assistantTemplates = [
    { id: "expand", label: "Expand graph" as const, value: templatePrompt("expand") },
    { id: "ingest", label: "Ingest topics" as const, value: templatePrompt("ingest") },
  ];
  const assistantOpen = assistantWidth >= ASSISTANT_MIN_WIDTH;
  const hasInlinePlanningWidget = currentChatState.messages.some((message) => Boolean(message.planning_status));
  const overlayLeftOffset = leftSidebarOpen ? 280 : 68;
  const overlayRightOffset = assistantOpen ? assistantWidth + 20 : 56;
  const topOverlayCompact =
    !isMobileViewport
    && viewportWidth - overlayLeftOffset - overlayRightOffset < COMPACT_TOP_OVERLAY_THRESHOLD;

  const handleSelectTopic = useCallback((topicId: string | null, anchor: TopicAnchorPoint | null) => {
    setSelectedTopicId(topicId);
    setSelectedTopicAnchor(anchor);
  }, []);

  const openSidebar = useCallback(() => {
    if (sidebarCloseTimerRef.current) {
      window.clearTimeout(sidebarCloseTimerRef.current);
      sidebarCloseTimerRef.current = null;
    }
    setLeftSidebarClosing(false);
    setLeftSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    if (!leftSidebarOpen || leftSidebarClosing) return;
    setLeftSidebarClosing(true);
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      setLeftSidebarOpen(false);
      setLeftSidebarClosing(false);
      sidebarCloseTimerRef.current = null;
    }, 220);
  }, [leftSidebarClosing, leftSidebarOpen]);

  const openConfigurationSettings = useCallback(() => {
    setSettingsOpen((prev) => !prev);
    setMobileMenuOpen(false);
  }, []);

  const loadDebugLogs = useCallback(async () => {
    setDebugLogsLoading((current) => current || debugLogs === null);
    if (debugLogs === null) {
      setDebugLogsError(null);
    }
    try {
      const response = await apiFetch(`${API_BASE}/api/v1/debug/logs`);
      if (!response.ok) {
        throw new Error(`debug logs failed with ${response.status}`);
      }
      const payload = (await response.json()) as DebugLogSnapshot;
      setDebugLogs(payload);
      setDebugLogsError(null);
    } catch (loadError) {
      setDebugLogsError(loadError instanceof Error ? loadError.message : "Failed to load debug logs");
    } finally {
      setDebugLogsLoading(false);
    }
  }, [debugLogs]);

  useEffect(() => {
    if (!isLogsOpen || !debugModeEnabled) return;
    void loadDebugLogs();
    const interval = window.setInterval(() => {
      void loadDebugLogs();
    }, 1200);
    return () => window.clearInterval(interval);
  }, [debugModeEnabled, isLogsOpen, loadDebugLogs]);

  const sidebarVisible = leftSidebarOpen || leftSidebarClosing;

  return (
    <div className="app" data-theme={themeModeDraft}>
      <div className="ambient-glow" />
      <WorkspaceShell
        copy={copy}
        sidebarVisible={sidebarVisible}
        leftSidebarClosing={leftSidebarClosing}
        closeSidebar={closeSidebar}
        projectsExpanded={projectsExpanded}
        setProjectsExpanded={setProjectsExpanded}
        availableGraphs={availableGraphs}
        activeGraph={activeGraph}
        renamingGraphId={renamingGraphId}
        renameGraphDraft={renameGraphDraft}
        setRenameGraphDraft={setRenameGraphDraft}
        renameGraphSaving={renameGraphSaving}
        renameGraph={renameGraph}
        setError={setError}
        setRenamingGraphId={setRenamingGraphId}
        setActiveGraphId={setActiveGraphId}
        setSelectedTopicId={setSelectedTopicId}
        setSelectedTopicAnchor={setSelectedTopicAnchor}
        openExportGraphModal={openExportGraphModal}
        setDeleteConfirm={setDeleteConfirm}
        setCreateGraphOpen={setCreateGraphOpen}
        setCreateGraphError={setCreateGraphError}
        openConfigurationSettings={openConfigurationSettings}
        openDebugLogs={() => setLogsOpen(true)}
        isLogsOpen={isLogsOpen}
        isMobileViewport={isMobileViewport}
        leftSidebarOpen={leftSidebarOpen}
        openSidebar={openSidebar}
        assistantOpen={assistantOpen}
        setAssistantWidth={setAssistantWidth}
        assistantWidth={assistantWidth}
        viewportCenteredZoom={viewportCenteredZoom}
        setViewportCenteredZoom={setViewportCenteredZoom}
        topOverlayCompact={topOverlayCompact}
        overlayLeftOffset={overlayLeftOffset}
        overlayRightOffset={overlayRightOffset}
        data={data}
        assessmentError={assessmentError}
        configSaving={configSaving}
        error={error}
        graphSummary={graphSummary}
        activeAssessmentCards={activeAssessmentCards}
        graphLayoutEditing={graphLayoutEditing}
        graphLayoutSaving={graphLayoutSaving}
        saveGraphLayout={saveGraphLayout}
        startGraphLayoutEdit={startGraphLayoutEdit}
        setGraphLayoutEditing={setGraphLayoutEditing}
        setGraphLayoutDraft={setGraphLayoutDraft}
        floatingStatsRef={floatingStatsRef}
        graphShellRef={graphShellRef}
        focusData={focusData}
        addTopicResource={addTopicResource}
        addTopicArtifact={addTopicArtifact}
        handleSelectTopic={handleSelectTopic}
        handleSelectedTopicAnchorChange={handleSelectedTopicAnchorChange}
        selectedTopicId={selectedTopicId}
        graphLayoutDraft={graphLayoutDraft}
        activeGraphManualLayout={activeGraphManualLayout}
        liveDisableIdleAnimations={liveDisableIdleAnimations}
        showGraphLoadingState={showGraphLoadingState}
        showGraphEmptyState={showGraphEmptyState}
        onboardingNeedsFirstGraph={onboardingNeedsFirstGraph}
        workspaceSurface={workspaceSurface}
        selectedTopic={selectedTopic}
        popoverPosition={popoverPosition}
        topicPopoverRef={topicPopoverRef}
        popoverDragRef={popoverDragRef}
        selectedZoneLabel={selectedZoneLabel}
        selectedResourceLinks={selectedResourceLinks}
        selectedArtifacts={selectedArtifacts}
        selectedClosureStatus={selectedClosureStatus}
        topicTitlesById={topicTitlesById}
        quizError={quizError}
        quizSuccess={quizSuccess}
        closureTestsEnabled={closureTestsEnabled}
        quizLoading={quizLoading}
        startQuiz={startQuiz}
        markTopicFinished={markTopicFinished}
        assistantResizing={assistantResizing}
        handleAssistantResize={handleAssistantResize}
        chatSessions={chatSessions}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        sessionListWrapRef={sessionListWrapRef}
        sessionListRef={sessionListRef}
        sessionDragRef={sessionDragRef}
        apiFetch={apiFetch}
        loadSessions={loadSessions}
        currentChatState={currentChatState}
        chatViewportRef={chatViewportRef}
        chatThreadLoading={chatThreadLoading}
        hasInlinePlanningWidget={hasInlinePlanningWidget}
        chatLoading={chatLoading}
        chatError={chatError}
        chatSessionsError={chatSessionsError}
        updateCurrentChatState={updateCurrentChatState}
        sendChat={sendChat}
        applyLoadingMessageId={applyLoadingMessageId}
        applyProposalFromMessage={applyProposalFromMessage}
        summarizePreviewCounts={summarizePreviewCounts}
        summarizeTopOperations={summarizeTopOperations}
        setSessionDeleteConfirm={setSessionDeleteConfirm}
        applyError={applyError}
        assistantTemplates={assistantTemplates}
        composerUseGrounding={composerUseGrounding}
        setComposerUseGrounding={setComposerUseGrounding}
        chatComposerRef={chatComposerRef}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        sessionUser={sessionUser}
        isSettingsOpen={isSettingsOpen}
        debugModeEnabled={debugModeEnabled}
        themeMode={themeModeDraft}
        setThemeMode={setThemeModeDraft}
      />

      <SettingsModal
        isSettingsOpen={isSettingsOpen}
        copy={copy}
        setSettingsOpen={setSettingsOpen}
        currentConfig={currentConfig}
        providerDraft={providerDraft}
        setProviderDraft={setProviderDraft}
        modelDraft={modelDraft}
        setModelDraft={setModelDraft}
        modelPresetDraft={modelPresetDraft}
        setModelPresetDraft={setModelPresetDraft}
        geminiKeyLockedByEnv={geminiKeyLockedByEnv}
        geminiApiKeyDraft={geminiApiKeyDraft}
        setGeminiApiKeyDraft={setGeminiApiKeyDraft}
        openaiKeyLockedByEnv={openaiKeyLockedByEnv}
        openaiApiKeyDraft={openaiApiKeyDraft}
        setOpenaiApiKeyDraft={setOpenaiApiKeyDraft}
        providerOptions={currentConfig?.provider_options ?? ["gemini", "openai"]}
        openaiBaseUrlDraft={openaiBaseUrlDraft}
        setOpenaiBaseUrlDraft={setOpenaiBaseUrlDraft}
        openaiBaseUrlLockedByEnv={openaiBaseUrlLockedByEnv}
        showOpenAIEndpointDraft={showOpenAIEndpointDraft}
        setShowOpenAIEndpointDraft={setShowOpenAIEndpointDraft}
        activeThinkingOption={activeThinkingOption}
        activeThinkingValues={activeThinkingValues}
        thinkingModeDraft={thinkingModeDraft}
        setThinkingModeDraft={setThinkingModeDraft}
        plannerMaxTokensDraft={plannerMaxTokensDraft}
        setPlannerMaxTokensDraft={setPlannerMaxTokensDraft}
        plannerThinkingBudgetDraft={plannerThinkingBudgetDraft}
        setPlannerThinkingBudgetDraft={setPlannerThinkingBudgetDraft}
        orchestratorMaxTokensDraft={orchestratorMaxTokensDraft}
        setOrchestratorMaxTokensDraft={setOrchestratorMaxTokensDraft}
        quizMaxTokensDraft={quizMaxTokensDraft}
        setQuizMaxTokensDraft={setQuizMaxTokensDraft}
        assistantMaxTokensDraft={assistantMaxTokensDraft}
        setAssistantMaxTokensDraft={setAssistantMaxTokensDraft}
        personaDraft={personaDraft}
        setPersonaDraft={setPersonaDraft}
        disableIdleAnimationsDraft={disableIdleAnimationsDraft}
        setDisableIdleAnimationsDraft={setDisableIdleAnimationsDraft}
        activeMemoryOption={activeMemoryOption}
        activeMemoryValues={activeMemoryValues}
        memoryModeDraft={memoryModeDraft}
        setMemoryModeDraft={setMemoryModeDraft}
        memoryHistoryLimitDraft={memoryHistoryLimitDraft}
        setMemoryHistoryLimitDraft={setMemoryHistoryLimitDraft}
        memoryIncludeGraphContextDraft={memoryIncludeGraphContextDraft}
        setMemoryIncludeGraphContextDraft={setMemoryIncludeGraphContextDraft}
        memoryIncludeProgressContextDraft={memoryIncludeProgressContextDraft}
        setMemoryIncludeProgressContextDraft={setMemoryIncludeProgressContextDraft}
        memoryIncludeQuizContextDraft={memoryIncludeQuizContextDraft}
        setMemoryIncludeQuizContextDraft={setMemoryIncludeQuizContextDraft}
        memoryIncludeFrontierContextDraft={memoryIncludeFrontierContextDraft}
        setMemoryIncludeFrontierContextDraft={setMemoryIncludeFrontierContextDraft}
        memoryIncludeSelectedTopicContextDraft={memoryIncludeSelectedTopicContextDraft}
        setMemoryIncludeSelectedTopicContextDraft={setMemoryIncludeSelectedTopicContextDraft}
        activeGraph={activeGraph}
        loadSnapshots={loadSnapshots}
        historyLoading={historyLoading}
        historyError={historyError}
        snapshots={snapshots}
        data={data}
        rollbackSnapshot={rollbackSnapshot}
        enableClosureTestsDraft={enableClosureTestsDraft}
        setEnableClosureTestsDraft={setEnableClosureTestsDraft}
        debugModeEnabledDraft={debugModeEnabledDraft}
        setDebugModeEnabledDraft={setDebugModeEnabledDraft}
        themeModeDraft={themeModeDraft}
        setThemeModeDraft={setThemeModeDraft}
        quizQuestionCountDraft={quizQuestionCountDraft}
        setQuizQuestionCountDraft={setQuizQuestionCountDraft}
        quizPassCountDraft={quizPassCountDraft}
        setQuizPassCountDraft={setQuizPassCountDraft}
        configSaving={configSaving}
        settingsDirty={settingsDirty}
        saveSettings={saveSettings}
      />

      <DebugLogsModal
        copy={copy}
        open={isLogsOpen}
        onClose={() => setLogsOpen(false)}
        logs={debugLogs}
        loading={debugLogsLoading}
        error={debugLogsError}
      />

      <AppDialogs
        copy={copy}
        deleteConfirm={deleteConfirm}
        deleteGraphModalRef={deleteGraphModalRef}
        closeDeleteGraphModal={closeDeleteGraphModal}
        deleteGraphCancelButtonRef={deleteGraphCancelButtonRef}
        apiFetch={apiFetch}
        readErrorMessage={readErrorMessage}
        setDeleteConfirm={setDeleteConfirm}
        setData={setData}
        setActiveGraphId={setActiveGraphId}
        clearChatStateForGraph={clearChatStateForGraph}
        loadSnapshots={loadSnapshots}
        loadSessionInfo={loadSessionInfo}
        setError={setError}
        sessionDeleteConfirm={sessionDeleteConfirm}
        sessionDeleteModalRef={sessionDeleteModalRef}
        closeSessionDeleteModal={closeSessionDeleteModal}
        sessionDeleteCancelButtonRef={sessionDeleteCancelButtonRef}
        setSessionDeleteConfirm={setSessionDeleteConfirm}
        activeGraph={activeGraph}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        loadSessions={loadSessions}
        createGraphOpen={createGraphOpen}
        createGraphModalRef={createGraphModalRef}
        closeCreateGraphModal={closeCreateGraphModal}
        createGraphTitleInputRef={createGraphTitleInputRef}
        createGraphDraft={createGraphDraft}
        setCreateGraphDraft={setCreateGraphDraft}
        createGraphError={createGraphError}
        openImportGraphModal={openImportGraphModal}
        createGraphLoading={createGraphLoading}
        createGraph={createGraph}
        importGraphOpen={importGraphOpen}
        importGraphModalRef={importGraphModalRef}
        closeImportGraphModal={closeImportGraphModal}
        importGraphFileInputRef={importGraphFileInputRef}
        importGraphFileButtonRef={importGraphFileButtonRef}
        handleImportGraphFile={handleImportGraphFile}
        importGraphFileName={importGraphFileName}
        importGraphPayload={importGraphPayload}
        importGraphTitleDraft={importGraphTitleDraft}
        setImportGraphTitleDraft={setImportGraphTitleDraft}
        importGraphIncludeProgressDraft={importGraphIncludeProgressDraft}
        setImportGraphIncludeProgressDraft={setImportGraphIncludeProgressDraft}
        importGraphError={importGraphError}
        importGraphLoading={importGraphLoading}
        importGraphFromPackage={importGraphFromPackage}
        exportGraphTarget={exportGraphTarget}
        exportGraphModalRef={exportGraphModalRef}
        closeExportGraphModal={closeExportGraphModal}
        exportGraphTitleInputRef={exportGraphTitleInputRef}
        exportGraphTitleDraft={exportGraphTitleDraft}
        setExportGraphTitleDraft={setExportGraphTitleDraft}
        exportGraphIncludeProgressDraft={exportGraphIncludeProgressDraft}
        setExportGraphIncludeProgressDraft={setExportGraphIncludeProgressDraft}
        exportGraphError={exportGraphError}
        exportGraphLoading={exportGraphLoading}
        exportGraph={exportGraph}
        quizSession={quizSession}
        quizModalRef={quizModalRef}
        quizCloseButtonRef={quizCloseButtonRef}
        selectedTopic={selectedTopic}
        closeQuizModal={closeQuizModal}
        quizError={quizError}
        quizReviews={quizReviews}
        quizAnswers={quizAnswers}
        setQuizAnswers={setQuizAnswers}
        quizLoading={quizLoading}
        submitQuiz={submitQuiz}
      />
    </div>
  );
}
