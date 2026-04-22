import React from "react";
import { BookBookmark, BugBeetle, CaretDown, CaretLeft, CaretRight, ChatCircleDots, Check, CrosshairSimple, DownloadSimple, GearSix, PencilSimple, SquaresFour } from "@phosphor-icons/react";

import { APP_NAME, ASSISTANT_MIN_WIDTH, type AuthSessionPayload, type GraphChatState, type ThemeMode, type WorkspaceSurfacePayload } from "../lib/appContracts";
import { API_BASE } from "../lib/api";
import {
  LIGHT_DESKTOP_LAYOUT_STORAGE_KEY,
  clampFloatingPosition,
  canPlaceFloatingRect,
  computeCanonicalLightDesktopLayout,
  makeFloatingRect,
  readStoredLightDesktopLayout,
  toFloatingRect,
  type FloatingRect,
  type FloatingWindowDragTarget,
  type FloatingWindowPosition,
  type StoredLightDesktopLayout,
} from "../lib/floatingDesktopLayout";
import { renderDisplayText, safeExternalUrl, userInitials, type ManualLayoutPositions, type PopoverPosition, type apiFetch } from "../lib/appUiHelpers";
import type { AppCopy } from "../lib/appCopy";
import { formatMinutes, formatTopicState } from "../lib/graph";
import { useModalAccessibility } from "../lib/useModalAccessibility";
import { GraphCanvas } from "./GraphCanvas";
import type { TopicAnchorPoint } from "./GraphCanvas";
import { AssistantModelMenuTrigger, LightChatWindow, LightWorkspaceWindow, TopicAssetModal } from "./WorkspaceShellAuxWindows";
import { TopStatsOverlay } from "./TopStatsOverlay";
import type {
  Artifact,
  ChatMessage,
  ChatSessionSummary,
  GraphAssessment,
  GraphEnvelope,
  ProposalGenerateResponse,
  ResourceLink,
  Topic,
  TopicClosureStatus,
  WorkspaceEnvelope,
} from "../lib/types";

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

  const noop = () => {};
  const LIGHT_WORKSPACE_EXPANDED_GRAPH_STORAGE_KEY = "knowledge_graph_light_workspace_expanded_graph_v1";

type GraphSummary = {
  topicCount: number;
  completedPercent: number;
  completedCount: number;
  reviewCount: number;
};

type FocusData = {
  rootIds: Set<string>;
  ancestorIds: Set<string>;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
  frontierEdgeIds: Set<string>;
  pathLayers: Array<Array<{ id: string; title: string }>>;
};

type AssistantTemplate = {
  id: string;
  label: string;
  value: string;
};

type WorkspaceShellProps = {
  copy: AppCopy;
  sidebarVisible: boolean;
  leftSidebarClosing: boolean;
  closeSidebar: () => void;
  projectsExpanded: boolean;
  setProjectsExpanded: StateSetter<boolean>;
  availableGraphs: GraphEnvelope[];
  activeGraph: GraphEnvelope | null;
  renamingGraphId: string | null;
  renameGraphDraft: string;
  setRenameGraphDraft: StateSetter<string>;
  renameGraphSaving: boolean;
  renameGraph: (graphId: string) => Promise<void>;
  setError: StateSetter<string | null>;
  setRenamingGraphId: StateSetter<string | null>;
  setActiveGraphId: StateSetter<string | null>;
  setSelectedTopicId: StateSetter<string | null>;
  setSelectedTopicAnchor: StateSetter<TopicAnchorPoint | null>;
  openExportGraphModal: (graph: GraphEnvelope) => void;
  setDeleteConfirm: StateSetter<{ graphId: string; title: string } | null>;
  setCreateGraphOpen: StateSetter<boolean>;
  setCreateGraphError: StateSetter<string | null>;
  openConfigurationSettings: () => void;
  openDebugLogs: () => void;
  closeOverlaySurfaces: () => void;
  isLogsOpen: boolean;
  modalSurfaceLocked: boolean;
  isMobileViewport: boolean;
  leftSidebarOpen: boolean;
  openSidebar: () => void;
  assistantOpen: boolean;
  setAssistantWidth: StateSetter<number>;
  assistantWidth: number;
  viewportCenteredZoom: boolean;
  setViewportCenteredZoom: StateSetter<boolean>;
  straightEdgeLinesEnabled: boolean;
  topOverlayCompact: boolean;
  overlayLeftOffset: number;
  overlayRightOffset: number;
  data: WorkspaceEnvelope | null;
  assessmentError: string | null;
  configSaving: boolean;
  error: string | null;
  graphSummary: GraphSummary;
  activeAssessmentCards: GraphAssessment["cards"];
  graphLayoutEditing: boolean;
  graphLayoutSaving: boolean;
  saveGraphLayout: () => Promise<void>;
  startGraphLayoutEdit: () => void;
  setGraphLayoutEditing: StateSetter<boolean>;
  setGraphLayoutDraft: StateSetter<ManualLayoutPositions | null>;
  floatingStatsRef: React.RefObject<HTMLDivElement | null>;
  graphShellRef: React.RefObject<HTMLDivElement | null>;
  focusData: FocusData;
  addTopicResource: (topicId: string, url: string) => Promise<void>;
  addTopicArtifact: (topicId: string, title: string, body: string) => Promise<void>;
  handleSelectTopic: (topicId: string | null, anchor: TopicAnchorPoint | null) => void;
  handleSelectedTopicAnchorChange: (next: TopicAnchorPoint | null) => void;
  selectedTopicId: string | null;
  graphLayoutDraft: ManualLayoutPositions | null;
  activeGraphManualLayout: ManualLayoutPositions | null;
  liveDisableIdleAnimations: boolean;
  showGraphLoadingState: boolean;
  showGraphEmptyState: boolean;
  onboardingNeedsFirstGraph: boolean;
  workspaceSurface: WorkspaceSurfacePayload | null;
  selectedTopic: Topic | null;
  popoverPosition: PopoverPosition | null;
  topicPopoverRef: React.RefObject<HTMLDivElement | null>;
  popoverDragRef: React.MutableRefObject<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>;
  selectedZoneLabel: string;
  selectedResourceLinks: ResourceLink[];
  selectedArtifacts: Artifact[];
  selectedClosureStatus: TopicClosureStatus | null;
  topicTitlesById: Map<string, string>;
  quizError: string | null;
  quizSuccess: string | null;
  closureTestsEnabled: boolean;
  quizLoading: boolean;
  startQuiz: () => Promise<void>;
  markTopicFinished: () => Promise<void>;
  assistantResizing: boolean;
  handleAssistantResize: (startX: number) => void;
  chatSessions: ChatSessionSummary[];
  activeSessionId: string | null;
  setActiveSessionId: StateSetter<string | null>;
  sessionListWrapRef: React.RefObject<HTMLDivElement | null>;
  sessionListRef: React.RefObject<HTMLDivElement | null>;
  sessionDragRef: React.MutableRefObject<{ startX: number; scrollLeft: number } | null>;
  apiFetch: typeof apiFetch;
  loadSessions: () => Promise<void>;
  currentChatState: GraphChatState;
  chatViewportRef: React.RefObject<HTMLDivElement | null>;
  chatThreadLoading: boolean;
  hasInlinePlanningWidget: boolean;
  chatLoading: boolean;
  chatError: string | null;
  chatSessionsError: string | null;
  updateCurrentChatState: (updater: (current: GraphChatState) => GraphChatState) => void;
  sendChat: (overridePrompt?: string, options?: { hiddenUserMessage?: boolean; baseMessages?: ChatMessage[] }) => Promise<void>;
  applyLoadingMessageId: string | null;
  applyProposalFromMessage: (messageId: string, proposal: ProposalGenerateResponse) => Promise<void>;
  summarizePreviewCounts: (proposal: ProposalGenerateResponse) => Array<{ label: string; value: number }>;
  summarizeTopOperations: (proposal: ProposalGenerateResponse) => Array<{ label: string; target: string }>;
  setSessionDeleteConfirm: StateSetter<{ sessionId: string; title: string } | null>;
  applyError: string | null;
  assistantTemplates: AssistantTemplate[];
  chatModelOptions: string[];
  selectedChatModel: string | null;
  setSelectedChatModel: StateSetter<string | null>;
  composerUseGrounding: boolean;
  setComposerUseGrounding: StateSetter<boolean>;
  chatComposerRef: React.RefObject<HTMLTextAreaElement | null>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: StateSetter<boolean>;
  sessionUser: AuthSessionPayload["user"];
  isSettingsOpen: boolean;
  debugModeEnabled: boolean;
  themeMode: ThemeMode;
  setThemeMode: StateSetter<ThemeMode>;
  overlayRestoreEpoch: number;
};

export function WorkspaceShell(props: WorkspaceShellProps): React.JSX.Element {
  const {
    copy,
    sidebarVisible,
    leftSidebarClosing,
    closeSidebar,
    projectsExpanded,
    setProjectsExpanded,
    availableGraphs,
    activeGraph,
    setError,
    renamingGraphId,
    renameGraphDraft,
    setRenameGraphDraft,
    renameGraphSaving,
    renameGraph,
    setRenamingGraphId,
    setActiveGraphId,
    setSelectedTopicId,
    setSelectedTopicAnchor,
    openExportGraphModal,
    setDeleteConfirm,
    setCreateGraphOpen,
    setCreateGraphError,
    openConfigurationSettings,
    openDebugLogs,
    closeOverlaySurfaces,
    isLogsOpen,
    modalSurfaceLocked,
    isMobileViewport,
    leftSidebarOpen,
    openSidebar,
    assistantOpen,
    setAssistantWidth,
    assistantWidth,
    viewportCenteredZoom,
    setViewportCenteredZoom,
    straightEdgeLinesEnabled,
    topOverlayCompact,
    overlayLeftOffset,
    overlayRightOffset,
    data,
    assessmentError,
    configSaving,
    error,
    graphSummary,
    activeAssessmentCards,
    graphLayoutEditing,
    graphLayoutSaving,
    saveGraphLayout,
    startGraphLayoutEdit,
    setGraphLayoutEditing,
    setGraphLayoutDraft,
    floatingStatsRef,
    graphShellRef,
    focusData,
    addTopicResource,
    addTopicArtifact,
    handleSelectTopic,
    handleSelectedTopicAnchorChange,
    selectedTopicId,
    graphLayoutDraft,
    activeGraphManualLayout,
    liveDisableIdleAnimations,
    showGraphLoadingState,
    showGraphEmptyState,
    onboardingNeedsFirstGraph,
    workspaceSurface,
    selectedTopic,
    popoverPosition,
    topicPopoverRef,
    popoverDragRef,
    selectedZoneLabel,
    selectedResourceLinks,
    selectedArtifacts,
    selectedClosureStatus,
    topicTitlesById,
    quizError,
    quizSuccess,
    closureTestsEnabled,
    quizLoading,
    startQuiz,
    markTopicFinished,
    assistantResizing,
    handleAssistantResize,
    chatSessions,
    activeSessionId,
    setActiveSessionId,
    sessionListWrapRef,
    sessionListRef,
    sessionDragRef,
    apiFetch,
    loadSessions,
    currentChatState,
    chatViewportRef,
    chatThreadLoading,
    hasInlinePlanningWidget,
    chatLoading,
    chatError,
    chatSessionsError,
    updateCurrentChatState,
    sendChat,
    applyLoadingMessageId,
    applyProposalFromMessage,
    summarizePreviewCounts,
    summarizeTopOperations,
    setSessionDeleteConfirm,
    applyError,
    assistantTemplates,
    chatModelOptions,
    selectedChatModel,
    setSelectedChatModel,
    composerUseGrounding,
    setComposerUseGrounding,
    chatComposerRef,
    mobileMenuOpen,
    setMobileMenuOpen,
    sessionUser,
    isSettingsOpen,
    debugModeEnabled,
    themeMode,
    setThemeMode,
    overlayRestoreEpoch,
  } = props;
  const assistantDisplayName = data?.workspace.config.assistant_nickname?.trim() || copy.sessions.assistantTitle;
  const experimentalLightDesktop = !isMobileViewport;
  const shellSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const workspaceWindowRef = React.useRef<HTMLDivElement | null>(null);
  const chatWindowRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<{
    target: FloatingWindowDragTarget;
    origin: FloatingWindowPosition;
    lastValid: FloatingWindowPosition;
    startPointerX: number;
    startPointerY: number;
    shellRect: DOMRect;
    size: { width: number; height: number };
  } | null>(null);
  const storedLightDesktopLayout = React.useMemo(() => readStoredLightDesktopLayout(), []);
  const hadStoredLightDesktopLayoutRef = React.useRef(Boolean(storedLightDesktopLayout));
  const lightDesktopLayoutInitializedRef = React.useRef(false);
  const prevLightWorkspacePanelOpenRef = React.useRef(false);
  const prevLightChatPanelOpenRef = React.useRef(false);
  const lastOverlayRestoreEpochRef = React.useRef(overlayRestoreEpoch);
  const [dockPosition, setDockPosition] = React.useState<FloatingWindowPosition>(() => storedLightDesktopLayout?.dock ?? { x: 18, y: 82 });
  const [workspaceWindowPosition, setWorkspaceWindowPosition] = React.useState<FloatingWindowPosition>(() => storedLightDesktopLayout?.workspace ?? { x: 92, y: 86 });
  const [chatWindowPosition, setChatWindowPosition] = React.useState<FloatingWindowPosition>(() => storedLightDesktopLayout?.chat ?? { x: 0, y: 84 });
  const [lightWorkspaceExpandedGraphId, setLightWorkspaceExpandedGraphId] = React.useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(LIGHT_WORKSPACE_EXPANDED_GRAPH_STORAGE_KEY);
      return stored && stored.trim() ? stored : null;
    } catch {
      return null;
    }
  });
  const showMobileOverlay = isMobileViewport && !isSettingsOpen;
  const showCompactDesktopOverlay = topOverlayCompact && !isMobileViewport && !isSettingsOpen;
  const showInlineDesktopOverlay = !topOverlayCompact && !isMobileViewport && !isSettingsOpen;
  const lightWorkspacePanelOpen = experimentalLightDesktop && leftSidebarOpen;
  const lightChatPanelOpen = experimentalLightDesktop && assistantOpen;
  const overlayLeftInset = experimentalLightDesktop ? 104 : overlayLeftOffset;
  const overlayRightInset = experimentalLightDesktop ? 24 : overlayRightOffset;
  const getDockIconWeight = React.useCallback(
    (isActive: boolean) => {
      if (themeMode === "dark") return "regular";
      return isActive ? "regular" : "duotone";
    },
    [themeMode],
  );

  const graphCanvasBackgroundFill = themeMode === "light" ? "#f7f7f4" : "#000000";
  const [topicAssetDialog, setTopicAssetDialog] = React.useState<{
    kind: "resource" | "artifact";
    topicId: string;
    topicTitle: string;
  } | null>(null);
  const [topicAssetSaving, setTopicAssetSaving] = React.useState(false);
  const [topicAssetError, setTopicAssetError] = React.useState<string | null>(null);
  const [topicResourceUrlDraft, setTopicResourceUrlDraft] = React.useState("");
  const [topicArtifactTitleDraft, setTopicArtifactTitleDraft] = React.useState("");
  const [topicArtifactBodyDraft, setTopicArtifactBodyDraft] = React.useState("");
  const topicAssetModalRef = React.useRef<HTMLDivElement | null>(null);
  const topicAssetPrimaryInputRef = React.useRef<HTMLElement | null>(null);
  const closeTopicAssetModal = React.useCallback(() => {
    setTopicAssetDialog(null);
    setTopicAssetSaving(false);
    setTopicAssetError(null);
    setTopicResourceUrlDraft("");
    setTopicArtifactTitleDraft("");
    setTopicArtifactBodyDraft("");
  }, []);
  useModalAccessibility({
    isOpen: Boolean(topicAssetDialog),
    modalRef: topicAssetModalRef,
    onClose: closeTopicAssetModal,
    initialFocusRef: topicAssetPrimaryInputRef,
  });
  React.useEffect(() => {
    closeTopicAssetModal();
  }, [closeTopicAssetModal, selectedTopic?.id]);

  const beginFloatingDrag = React.useCallback((target: FloatingWindowDragTarget, event: React.PointerEvent<HTMLElement>) => {
    if (!experimentalLightDesktop) return;
    const shell = shellSurfaceRef.current;
    const targetElement = target === "dock" ? dockRef.current : target === "workspace" ? workspaceWindowRef.current : chatWindowRef.current;
    if (!shell || !targetElement) return;
    const shellRect = shell.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const origin = target === "dock" ? dockPosition : target === "workspace" ? workspaceWindowPosition : chatWindowPosition;
    dragStateRef.current = {
      target,
      origin,
      lastValid: origin,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      shellRect,
      size: { width: targetRect.width, height: targetRect.height },
    };
    document.body.style.userSelect = "none";
    event.preventDefault();
  }, [chatWindowPosition, dockPosition, experimentalLightDesktop, workspaceWindowPosition]);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const nextPosition = {
        x: drag.origin.x + (event.clientX - drag.startPointerX),
        y: drag.origin.y + (event.clientY - drag.startPointerY),
      };
      const blockedRects: FloatingRect[] = [];

      // Only TOP TAGS (individual stat chips + topic popover) block window drag.
      // Block each chip independently, not the whole container — container has empty padding
      // that would create a phantom block. Windows/chat/dock do NOT block each other.
      const statsContainer = floatingStatsRef.current;
      if (statsContainer) {
        for (const child of Array.from(statsContainer.children) as HTMLElement[]) {
          const rect = child.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            blockedRects.push(toFloatingRect(drag.shellRect, rect));
          }
        }
      }
      if (selectedTopic && popoverPosition) {
        const topicPopoverRect = topicPopoverRef.current?.getBoundingClientRect();
        if (topicPopoverRect) blockedRects.push(toFloatingRect(drag.shellRect, topicPopoverRect));
      }

      const clampedCandidate = clampFloatingPosition(drag.target, nextPosition, drag.size, drag.shellRect);
      const candidateRect = makeFloatingRect(clampedCandidate, drag.size);
      const xOnlyCandidate = { x: clampedCandidate.x, y: drag.lastValid.y };
      const yOnlyCandidate = { x: drag.lastValid.x, y: clampedCandidate.y };
      const xOnlyRect = makeFloatingRect(xOnlyCandidate, drag.size);
      const yOnlyRect = makeFloatingRect(yOnlyCandidate, drag.size);
      let resolved = drag.lastValid;

      if (canPlaceFloatingRect(candidateRect, blockedRects)) {
        resolved = clampedCandidate;
      } else if (canPlaceFloatingRect(xOnlyRect, blockedRects)) {
        resolved = xOnlyCandidate;
      } else if (canPlaceFloatingRect(yOnlyRect, blockedRects)) {
        resolved = yOnlyCandidate;
      }
      drag.lastValid = resolved;

      if (drag.target === "workspace") {
        setWorkspaceWindowPosition(resolved);
      } else if (drag.target === "chat") {
        setChatWindowPosition(resolved);
      } else if (drag.target === "dock") {
        setDockPosition(resolved);
      }
    };
    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [floatingStatsRef, lightChatPanelOpen, lightWorkspacePanelOpen, popoverPosition, selectedTopic, topicPopoverRef]);

  const applyCanonicalLightDesktopLayout = React.useCallback(() => {
    if (!experimentalLightDesktop) return;
    const shell = shellSurfaceRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const dockRect = dockRef.current?.getBoundingClientRect();
    const workspaceRect = workspaceWindowRef.current?.getBoundingClientRect();
    const chatRect = chatWindowRef.current?.getBoundingClientRect();
    const dockSize = dockRect ? { width: dockRect.width, height: dockRect.height } : { width: 72, height: 320 };
    const workspaceSize = workspaceRect ? { width: workspaceRect.width, height: workspaceRect.height } : { width: 400, height: 520 };
    const chatSize = chatRect ? { width: chatRect.width, height: chatRect.height } : { width: Math.min(Math.max(assistantWidth, 390), 460), height: 760 };
    const next = computeCanonicalLightDesktopLayout(shellRect, dockSize, workspaceSize, chatSize);
    setDockPosition(next.dock);
    setWorkspaceWindowPosition(next.workspace);
    setChatWindowPosition(next.chat);
  }, [assistantWidth, experimentalLightDesktop]);

  React.useLayoutEffect(() => {
    if (!experimentalLightDesktop) {
      lightDesktopLayoutInitializedRef.current = false;
      prevLightWorkspacePanelOpenRef.current = false;
      prevLightChatPanelOpenRef.current = false;
      return;
    }
    if (lightDesktopLayoutInitializedRef.current) return;
    if (!hadStoredLightDesktopLayoutRef.current) {
      applyCanonicalLightDesktopLayout();
    }
    lightDesktopLayoutInitializedRef.current = true;
  }, [applyCanonicalLightDesktopLayout, experimentalLightDesktop]);

  React.useLayoutEffect(() => {
    if (!experimentalLightDesktop) return;
    const restoredFromOverlay = overlayRestoreEpoch !== lastOverlayRestoreEpochRef.current;
    if (restoredFromOverlay) {
      applyCanonicalLightDesktopLayout();
    }
    lastOverlayRestoreEpochRef.current = overlayRestoreEpoch;
    prevLightWorkspacePanelOpenRef.current = lightWorkspacePanelOpen;
    prevLightChatPanelOpenRef.current = lightChatPanelOpen;
  }, [
    applyCanonicalLightDesktopLayout,
    experimentalLightDesktop,
    lightChatPanelOpen,
    lightWorkspacePanelOpen,
    overlayRestoreEpoch,
  ]);

  React.useLayoutEffect(() => {
    if (!experimentalLightDesktop) return;
    const shell = shellSurfaceRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    setDockPosition((current) => ({
      x: Math.min(Math.max(18, current.x), Math.max(18, rect.width - 92)),
      y: Math.min(Math.max(72, current.y), Math.max(18, rect.height - 360)),
    }));
    setWorkspaceWindowPosition((current) => ({
      x: Math.min(Math.max(104, current.x), Math.max(24, rect.width - 428)),
      y: Math.min(Math.max(84, current.y), Math.max(24, rect.height - 420)),
    }));
    setChatWindowPosition((current) => {
      const defaultX = Math.max(180, rect.width - Math.min(Math.max(assistantWidth, 390), 460) - 28);
      return {
        x: Math.min(Math.max(180, current.x || defaultX), Math.max(40, rect.width - 470)),
        y: Math.min(Math.max(76, current.y), Math.max(24, rect.height - 560)),
      };
    });
  }, [assistantWidth, experimentalLightDesktop]);

  React.useLayoutEffect(() => {
    if (!experimentalLightDesktop) return;
    const shell = shellSurfaceRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const dockRect = dockRef.current?.getBoundingClientRect();
    const workspaceRect = workspaceWindowRef.current?.getBoundingClientRect();
    const chatRect = chatWindowRef.current?.getBoundingClientRect();

    const dockSize = dockRect ? { width: dockRect.width, height: dockRect.height } : { width: 72, height: 320 };
    const workspaceSize = workspaceRect ? { width: workspaceRect.width, height: workspaceRect.height } : { width: 400, height: 520 };
    const chatSize = chatRect ? { width: chatRect.width, height: chatRect.height } : { width: Math.min(Math.max(assistantWidth, 390), 460), height: 760 };

    const nextDockPosition = clampFloatingPosition("dock", dockPosition, dockSize, shellRect);
    const nextWorkspacePosition = lightWorkspacePanelOpen
      ? clampFloatingPosition("workspace", workspaceWindowPosition, workspaceSize, shellRect)
      : workspaceWindowPosition;
    const nextChatPosition = lightChatPanelOpen
      ? clampFloatingPosition("chat", chatWindowPosition, chatSize, shellRect)
      : chatWindowPosition;

    if (nextDockPosition.x !== dockPosition.x || nextDockPosition.y !== dockPosition.y) {
      setDockPosition(nextDockPosition);
    }
    if (nextWorkspacePosition.x !== workspaceWindowPosition.x || nextWorkspacePosition.y !== workspaceWindowPosition.y) {
      setWorkspaceWindowPosition(nextWorkspacePosition);
    }
    if (nextChatPosition.x !== chatWindowPosition.x || nextChatPosition.y !== chatWindowPosition.y) {
      setChatWindowPosition(nextChatPosition);
    }
  }, [
    assistantWidth,
    chatWindowPosition,
    dockPosition,
    experimentalLightDesktop,
    floatingStatsRef,
    lightChatPanelOpen,
    lightWorkspacePanelOpen,
    overlayLeftOffset,
    overlayRightOffset,
    popoverPosition,
    selectedTopic,
    topicPopoverRef,
    workspaceWindowPosition,
  ]);

  React.useEffect(() => {
    if (!experimentalLightDesktop) return;
    try {
      localStorage.setItem(
        LIGHT_DESKTOP_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          dock: dockPosition,
          workspace: workspaceWindowPosition,
          chat: chatWindowPosition,
        } satisfies StoredLightDesktopLayout),
      );
    } catch {
      // Ignore localStorage write failures.
    }
  }, [chatWindowPosition, dockPosition, experimentalLightDesktop, workspaceWindowPosition]);
  const activeSession = activeSessionId
    ? chatSessions.find((session) => session.session_id === activeSessionId) ?? null
    : null;
  const generalSession = chatSessions.find((session) => !session.topic_id) ?? null;
  const topicSessions = chatSessions.filter((session) => Boolean(session.topic_id));
  const visibleMessages = currentChatState.messages.filter((message) => !message.hidden);
  const pathTitles = focusData.pathLayers.flat().map((entry) => entry.title);
  const selectedTopicClosed = selectedTopic?.state === "solid" || selectedTopic?.state === "mastered";

  React.useEffect(() => {
    if (!experimentalLightDesktop) return;
    if (!activeGraph?.graph_id) return;
    setLightWorkspaceExpandedGraphId((current) => current ?? activeGraph.graph_id);
  }, [activeGraph?.graph_id, experimentalLightDesktop]);

  React.useEffect(() => {
    if (!experimentalLightDesktop) return;
    if (!lightWorkspaceExpandedGraphId) return;
    if (availableGraphs.some((graph) => graph.graph_id === lightWorkspaceExpandedGraphId)) return;
    setLightWorkspaceExpandedGraphId(activeGraph?.graph_id ?? null);
  }, [activeGraph?.graph_id, availableGraphs, experimentalLightDesktop, lightWorkspaceExpandedGraphId]);

  React.useEffect(() => {
    if (!experimentalLightDesktop) return;
    try {
      if (lightWorkspaceExpandedGraphId) {
        localStorage.setItem(LIGHT_WORKSPACE_EXPANDED_GRAPH_STORAGE_KEY, lightWorkspaceExpandedGraphId);
      } else {
        localStorage.removeItem(LIGHT_WORKSPACE_EXPANDED_GRAPH_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage write failures.
    }
  }, [experimentalLightDesktop, lightWorkspaceExpandedGraphId]);

  function openTopicAssetDialog(kind: "resource" | "artifact"): void {
    if (!selectedTopic) return;
    setTopicAssetDialog({ kind, topicId: selectedTopic.id, topicTitle: selectedTopic.title });
    setTopicAssetError(null);
    setTopicAssetSaving(false);
    setTopicResourceUrlDraft("");
    setTopicArtifactTitleDraft("");
    setTopicArtifactBodyDraft("");
  }

  async function submitTopicAssetDialog(): Promise<void> {
    if (!topicAssetDialog) return;
    setTopicAssetSaving(true);
    setTopicAssetError(null);
    try {
      if (topicAssetDialog.kind === "resource") {
        const safeUrl = safeExternalUrl(topicResourceUrlDraft);
        if (!safeUrl) {
          throw new Error("A valid link is required.");
        }
        await addTopicResource(topicAssetDialog.topicId, safeUrl);
      } else {
        await addTopicArtifact(topicAssetDialog.topicId, topicArtifactTitleDraft, topicArtifactBodyDraft);
      }
      closeTopicAssetModal();
    } catch (assetError) {
      setTopicAssetError(assetError instanceof Error ? assetError.message : copy.errors.updateConfig);
    } finally {
      setTopicAssetSaving(false);
    }
  }

  const toggleExperimentalWorkspaceWindow = (): void => {
    if (modalSurfaceLocked) {
      closeOverlaySurfaces();
    }
    if (leftSidebarOpen) {
      closeSidebar();
      return;
    }
    openSidebar();
  };

  const toggleExperimentalChatWindow = (): void => {
    if (modalSurfaceLocked) {
      closeOverlaySurfaces();
    }
    if (assistantOpen) {
      setAssistantWidth(0);
      return;
    }
    setAssistantWidth((current) => (current < ASSISTANT_MIN_WIDTH ? 390 : current));
  };

  const lightWorkspaceWindow = lightWorkspacePanelOpen ? (
    <LightWorkspaceWindow
      workspaceWindowRef={workspaceWindowRef}
      workspaceWindowPosition={workspaceWindowPosition}
      beginFloatingDrag={beginFloatingDrag}
      copy={copy}
      availableGraphs={availableGraphs}
      setCreateGraphOpen={setCreateGraphOpen}
      setCreateGraphError={setCreateGraphError}
      activeGraph={activeGraph}
      lightWorkspaceExpandedGraphId={lightWorkspaceExpandedGraphId}
      setLightWorkspaceExpandedGraphId={setLightWorkspaceExpandedGraphId}
      setActiveGraphId={setActiveGraphId}
      setSelectedTopicId={setSelectedTopicId}
      setSelectedTopicAnchor={setSelectedTopicAnchor}
      renamingGraphId={renamingGraphId}
      renameGraphDraft={renameGraphDraft}
      setRenameGraphDraft={setRenameGraphDraft}
      renameGraph={renameGraph}
      setRenamingGraphId={setRenamingGraphId}
      setError={setError}
      renameGraphSaving={renameGraphSaving}
      openExportGraphModal={openExportGraphModal}
      setDeleteConfirm={setDeleteConfirm}
      selectedTopicId={selectedTopicId}
      handleSelectTopic={handleSelectTopic}
    />
  ) : null;
  async function createTopicSession(): Promise<void> {
    if (!activeGraph || !selectedTopicId || !selectedTopic) return;
    const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: selectedTopicId, title: selectedTopic.title }),
    });
    if (!response.ok) return;
    const session = await response.json();
    setActiveSessionId(session.session_id);
    void loadSessions();
  }

  const lightChatWindow = lightChatPanelOpen ? (
    <LightChatWindow
      chatWindowRef={chatWindowRef}
      chatWindowPosition={chatWindowPosition}
      assistantWidth={assistantWidth}
      beginFloatingDrag={beginFloatingDrag}
      assistantDisplayName={assistantDisplayName}
      activeSession={activeSession}
      selectedTopic={selectedTopic}
      activeGraph={activeGraph}
      copy={copy}
      sessionListWrapRef={sessionListWrapRef}
      sessionListRef={sessionListRef}
      sessionDragRef={sessionDragRef}
      activeSessionId={activeSessionId}
      setActiveSessionId={setActiveSessionId}
      generalSession={generalSession}
      topicSessions={topicSessions}
      setSessionDeleteConfirm={setSessionDeleteConfirm}
      chatSessions={chatSessions}
      selectedTopicId={selectedTopicId}
      createTopicSession={createTopicSession}
      chatViewportRef={chatViewportRef}
      currentChatState={currentChatState}
      chatThreadLoading={chatThreadLoading}
      visibleMessages={visibleMessages}
      chatLoading={chatLoading}
      hasInlinePlanningWidget={hasInlinePlanningWidget}
      applyLoadingMessageId={applyLoadingMessageId}
      applyProposalFromMessage={applyProposalFromMessage}
      updateCurrentChatState={updateCurrentChatState}
      chatComposerRef={chatComposerRef}
      chatError={chatError}
      chatSessionsError={chatSessionsError}
      applyError={applyError}
      composerUseGrounding={composerUseGrounding}
      setComposerUseGrounding={setComposerUseGrounding}
      assistantTemplates={assistantTemplates}
      chatModelOptions={chatModelOptions}
      selectedChatModel={selectedChatModel}
      setSelectedChatModel={setSelectedChatModel}
      sendChat={sendChat}
    />
  ) : null;

  return (
    <>
      {!experimentalLightDesktop ? (
      <aside className={`leftSidebar ${sidebarVisible ? "leftSidebarVisible" : "leftSidebarCollapsed"} ${leftSidebarClosing ? "leftSidebarClosing" : ""}`}>
        <div className="sidebarHeader">
          <div className="sidebarBrand" aria-label={`${APP_NAME} brand`}>
            <span className="sidebarBrandMark" aria-hidden="true" />
          </div>
          <button className="sidebarToggleBtn" onClick={closeSidebar} title={copy.sidebar.closeSidebar}>
            <CaretLeft size={16} weight="bold" />
          </button>
        </div>

        <div className="sidebarScrollArea">
          <div className="sidebarTree" style={{ marginTop: "20px" }}>
            <div
              className="sidebarSectionHeader sidebarSectionHeaderActive"
              onClick={() => setProjectsExpanded(!projectsExpanded)}
            >
              {copy.shell.workspace} <CaretDown size={14} weight="bold" className="sidebarCaret" style={{ transform: projectsExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
            </div>
            {projectsExpanded && (
              <div className="sidebarTree sidebarTreeNested">
                {availableGraphs.map((graph) => (
                  <div
                    key={graph.graph_id}
                    className={`${graph.graph_id === activeGraph?.graph_id ? "sidebarGraphRow sidebarGraphRowActive" : "sidebarGraphRow"} ${renamingGraphId === graph.graph_id ? "sidebarGraphRowEditing" : ""}`}
                  >
                    {renamingGraphId === graph.graph_id ? (
                      <div className="sidebarTreeItem sidebarTreeItemInlineEdit">
                        <input
                          className="sidebarGraphTitleInput"
                          value={renameGraphDraft}
                          onChange={(event) => setRenameGraphDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void renameGraph(graph.graph_id);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingGraphId(null);
                              setRenameGraphDraft("");
                            }
                          }}
                          autoFocus
                          spellCheck={false}
                          aria-label={copy.sidebar.graphTitle}
                        />
                      </div>
                    ) : (
                      <button
                        className="sidebarTreeItem"
                        onClick={() => {
                          setActiveGraphId(graph.graph_id);
                          setSelectedTopicId(null);
                          setSelectedTopicAnchor(null);
                        }}
                        type="button"
                      >
                        <span>{graph.title}</span>
                      </button>
                    )}
                    <div className="sidebarGraphActions">
                      <button
                        className="sidebarExportBtn"
                        type="button"
                        title={copy.sidebar.exportGraph(graph.title)}
                        onClick={() => openExportGraphModal(graph)}
                      >
                        <DownloadSimple size={13} weight="bold" />
                      </button>
                      <button
                        className={`sidebarRenameBtn ${renamingGraphId === graph.graph_id ? "sidebarRenameBtnActive" : ""}`}
                        type="button"
                        title={renamingGraphId === graph.graph_id ? copy.sidebar.saveGraphTitle : copy.sidebar.renameGraph(graph.title)}
                        disabled={renameGraphSaving && renamingGraphId === graph.graph_id}
                        onClick={() => {
                          if (renamingGraphId === graph.graph_id) {
                            void renameGraph(graph.graph_id);
                            return;
                          }
                          setError(null);
                          setRenamingGraphId(graph.graph_id);
                          setRenameGraphDraft(graph.title);
                        }}
                      >
                        {renamingGraphId === graph.graph_id ? copy.settingsPanel.save : <PencilSimple size={12} weight="bold" />}
                      </button>
                      <button
                        className="sidebarDeleteBtn"
                        type="button"
                        title={copy.sidebar.deleteGraph(graph.title)}
                        onClick={() => setDeleteConfirm({ graphId: graph.graph_id, title: graph.title })}
                      >
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M5 2V1h6v1h3v1H2V2h3zm1 3v7h1V5H6zm3 0v7h1V5H9zM3 4h10l-.8 10H3.8L3 4z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="sidebarGraphRow">
                  <button
                    className="sidebarTreeItem"
                    style={{ opacity: 0.85 }}
                    onClick={() => {
                      setCreateGraphOpen(true);
                      setCreateGraphError(null);
                    }}
                    type="button"
                  >
                    <span>+ {copy.emptyState.createGraph}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sidebarAccountSection">
          <button
            className="sidebarAccountTrigger"
            onClick={openConfigurationSettings}
            type="button"
          >
            <GearSix size={16} weight="bold" className="sidebarIcon" />
            <div className="sidebarAccountMeta">
              <span className="sidebarAccountTriggerName">{copy.shell.configuration}</span>
            </div>
          </button>
          <a
            className="sidebarAccountTrigger sidebarAccountLink"
            href="https://mapmind.space/how-to-use"
            target="_blank"
            rel="noreferrer"
          >
            <BookBookmark size={16} weight="bold" className="sidebarIcon" />
            <div className="sidebarAccountMeta">
              <span className="sidebarAccountTriggerName">{copy.sidebar.documentation}</span>
            </div>
          </a>
          {debugModeEnabled ? (
            <button
              className="sidebarAccountTrigger"
              onClick={openDebugLogs}
              type="button"
            >
              <BugBeetle size={16} weight="bold" className="sidebarIcon" />
              <div className="sidebarAccountMeta">
                <span className="sidebarAccountTriggerName">{copy.sidebar.logs}</span>
              </div>
            </button>
          ) : null}
        </div>
      </aside>
      ) : null}

      <main className="main">
        {!experimentalLightDesktop && !isMobileViewport && !leftSidebarOpen && !leftSidebarClosing && (
          <button className="sidebarToggleBtn floatingToggle" onClick={openSidebar} title={copy.sidebar.openSidebar}>
            <CaretRight size={16} weight="bold" />
          </button>
        )}
        {!experimentalLightDesktop && !isMobileViewport && !assistantOpen && (
          <button
            className="sidebarToggleBtn floatingToggle floatingToggleRight"
            onClick={() => setAssistantWidth(ASSISTANT_MIN_WIDTH)}
            title={copy.sidebar.openChat}
            type="button"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
        )}

        {isMobileViewport && !isSettingsOpen ? (
          <div className="mobileGraphStrip">
            <button
              className="mobileGraphCreate"
              type="button"
              onClick={() => {
                setCreateGraphOpen(true);
                setCreateGraphError(null);
              }}
            >
              {copy.graphStats.newGraph}
            </button>
            <div className="mobileGraphScroller">
              {availableGraphs.map((graph) => (
                <button
                  key={graph.graph_id}
                  className={`mobileGraphChip ${graph.graph_id === activeGraph?.graph_id ? "mobileGraphChipActive" : ""}`}
                  type="button"
                  onClick={() => {
                    setActiveGraphId(graph.graph_id);
                    setSelectedTopicId(null);
                    setSelectedTopicAnchor(null);
                  }}
                >
                  {graph.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <TopStatsOverlay
          visible={showMobileOverlay}
          wrapperClassName="topOverlayStack topOverlayStackMobile"
          wrapperStyle={{
            left: "12px",
            right: "12px",
            top: "calc(75px + env(safe-area-inset-top, 0px))",
          }}
          floatingStatsRef={floatingStatsRef}
          activeGraph={activeGraph}
          graphSummary={graphSummary}
          copy={copy}
          activeAssessmentCards={activeAssessmentCards}
          data={data}
          assessmentError={assessmentError}
          configSaving={configSaving}
          error={error}
          graphLayoutEditing={graphLayoutEditing}
          graphLayoutSaving={graphLayoutSaving}
          topOverlayCompact={topOverlayCompact}
          isMobileViewport={isMobileViewport}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          viewportCenteredZoom={viewportCenteredZoom}
          setViewportCenteredZoom={setViewportCenteredZoom}
          saveGraphLayout={saveGraphLayout}
          startGraphLayoutEdit={startGraphLayoutEdit}
          setGraphLayoutEditing={setGraphLayoutEditing}
          setGraphLayoutDraft={setGraphLayoutDraft}
        />

        <TopStatsOverlay
          visible={showCompactDesktopOverlay}
          wrapperClassName="topOverlayStack"
          wrapperStyle={{
            left: `${overlayLeftInset}px`,
            right: `${overlayRightInset}px`,
            top: "20px",
          }}
          floatingStatsRef={floatingStatsRef}
          activeGraph={activeGraph}
          graphSummary={graphSummary}
          copy={copy}
          activeAssessmentCards={activeAssessmentCards}
          data={data}
          assessmentError={assessmentError}
          configSaving={configSaving}
          error={error}
          graphLayoutEditing={graphLayoutEditing}
          graphLayoutSaving={graphLayoutSaving}
          topOverlayCompact={topOverlayCompact}
          isMobileViewport={isMobileViewport}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          viewportCenteredZoom={viewportCenteredZoom}
          setViewportCenteredZoom={setViewportCenteredZoom}
          saveGraphLayout={saveGraphLayout}
          startGraphLayoutEdit={startGraphLayoutEdit}
          setGraphLayoutEditing={setGraphLayoutEditing}
          setGraphLayoutDraft={setGraphLayoutDraft}
        />

        <TopStatsOverlay
          visible={showInlineDesktopOverlay}
          wrapperClassName="topOverlayInline"
          wrapperStyle={{
            left: `${overlayLeftInset}px`,
            right: `${overlayRightInset}px`,
            top: "20px",
          }}
          floatingStatsRef={floatingStatsRef}
          activeGraph={activeGraph}
          graphSummary={graphSummary}
          copy={copy}
          activeAssessmentCards={activeAssessmentCards}
          data={data}
          assessmentError={assessmentError}
          configSaving={configSaving}
          error={error}
          graphLayoutEditing={graphLayoutEditing}
          graphLayoutSaving={graphLayoutSaving}
          topOverlayCompact={topOverlayCompact}
          isMobileViewport={isMobileViewport}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          viewportCenteredZoom={viewportCenteredZoom}
          setViewportCenteredZoom={setViewportCenteredZoom}
          saveGraphLayout={saveGraphLayout}
          startGraphLayoutEdit={startGraphLayoutEdit}
          setGraphLayoutEditing={setGraphLayoutEditing}
          setGraphLayoutDraft={setGraphLayoutDraft}
        />

        <div ref={shellSurfaceRef} className={`workspaceShell ${experimentalLightDesktop ? "workspaceShellLightDockMode" : ""}`}>
          <div className="workspaceMain">
            <div className="neuroLayout">
              <div ref={graphShellRef} className="neuroGraphShell">
                {isMobileViewport && activeGraph ? (
                  <button
                    className="mobileRecenterBtn"
                    onClick={() => {
                      const rootId = Array.from(focusData.rootIds)[0] || activeGraph.topics[0]?.id || null;
                      handleSelectTopic(rootId, null);
                    }}
                    title={copy.graphStats.centerGraph}
                  >
                    <CrosshairSimple size={18} weight="bold" />
                  </button>
                ) : null}
                {activeGraph ? (
                  <GraphCanvas
                    key={`graph:${activeGraph.graph_id}`}
                    topics={activeGraph.topics}
                    edges={activeGraph.edges}
                    zones={activeGraph.zones}
                    selectedTopicId={selectedTopicId}
                    rootIds={focusData.rootIds}
                    ancestorIds={focusData.ancestorIds}
                    pathNodeIds={focusData.pathNodeIds}
                    pathEdgeIds={focusData.pathEdgeIds}
                    frontierEdgeIds={focusData.frontierEdgeIds}
                    onSelectTopic={handleSelectTopic}
                    onSelectedTopicAnchorChange={handleSelectedTopicAnchorChange}
                    graphCacheKey={`graph:${activeGraph.graph_id}`}
                    initialZoom={0.45}
                    nodePositions={graphLayoutEditing ? graphLayoutDraft : activeGraphManualLayout}
                    layoutEditMode={graphLayoutEditing}
                    onNodePositionsChange={setGraphLayoutDraft}
                    disableIdleAnimations={liveDisableIdleAnimations}
                    viewportCenteredWheelZoom={viewportCenteredZoom}
                    curvedEdgeLinesEnabled={!straightEdgeLinesEnabled}
                    themeMode={themeMode}
                    backgroundFill={graphCanvasBackgroundFill}
                  />
                ) : showGraphLoadingState || showGraphEmptyState ? (
                  <div className="emptyStateShell">
                    <div className="emptyStateCanvas" aria-hidden="true">
                      <GraphCanvas
                        key={showGraphLoadingState ? "graph:loading" : "graph:empty"}
                        topics={[]}
                        edges={[]}
                        zones={[]}
                        selectedTopicId={null}
                        rootIds={new Set()}
                        ancestorIds={new Set()}
                        pathNodeIds={new Set()}
                        pathEdgeIds={new Set()}
                        onSelectTopic={noop}
                        onSelectedTopicAnchorChange={noop}
                        initialZoom={2.2}
                        targetZoom={2.2}
                        centerOnNodeId={null}
                        graphCacheKey={showGraphLoadingState ? "graph:loading" : "graph:empty"}
                        disableIdleAnimations={showGraphLoadingState}
                        viewportCenteredWheelZoom={viewportCenteredZoom}
                        curvedEdgeLinesEnabled={!straightEdgeLinesEnabled}
                        themeMode={themeMode}
                        backgroundFill={graphCanvasBackgroundFill}
                      />
                    </div>
                    {showGraphEmptyState ? (
                      <div className="emptyStateContent">
                        <h2>{onboardingNeedsFirstGraph ? copy.emptyState.onboardingTitle : copy.emptyState.emptyTitle}</h2>
                        <p>
                          {onboardingNeedsFirstGraph
                            ? copy.emptyState.onboardingBody
                            : copy.emptyState.emptyBody}
                        </p>
                        <div className="emptyStateActions">
                          <button
                            className="emptyStateAction"
                            disabled={workspaceSurface ? !workspaceSurface.can_create_graph : false}
                            onClick={() => {
                              setCreateGraphOpen(true);
                              setCreateGraphError(null);
                            }}
                            type="button"
                          >
                            {copy.emptyState.createGraph}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedTopic && popoverPosition ? (
                  <div
                    ref={topicPopoverRef}
                    className={`topicPopover topicPopover-${popoverPosition.side}`}
                    style={{ left: `${popoverPosition.left}px`, top: `${popoverPosition.top}px` }}
                    onPointerDown={(event) => {
                      const target = event.target;
                      if (target instanceof Element && target.closest("button, a, input, textarea, select")) {
                        return;
                      }
                      if (!popoverPosition) return;
                      popoverDragRef.current = {
                        pointerX: event.clientX,
                        pointerY: event.clientY,
                        startX: popoverPosition.left,
                        startY: popoverPosition.top,
                      };
                    }}
                  >
                    <div className="topicPopoverHeader">
                      <div className="topicPopoverEyebrow">{copy.topic.eyebrow}</div>
                      <button
                        className="topicPopoverClose"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          setSelectedTopicId(null);
                          setSelectedTopicAnchor(null);
                        }}
                        type="button"
                        aria-label={copy.topic.closeTopic}
                      >
                        ×
                      </button>
                    </div>
                    <div className="topicPopoverTitle">{selectedTopic.title}</div>
                    <div className="topicPopoverMeta">
                      <span className="badge badge-blue">{formatTopicState(selectedTopic.state)}</span>
                      <span className="badge badge-gray">{formatMinutes(selectedTopic.estimated_minutes, copy)}</span>
                      {selectedZoneLabel ? <span className="badge badge-gray">{selectedZoneLabel}</span> : null}
                    </div>
                    <div className="topicPopoverSection">
                      <div className="topicPopoverLabel">{copy.topic.description}</div>
                      <div className="topicPopoverCopy">{renderDisplayText(selectedTopic.description || copy.topic.noDescription)}</div>
                    </div>
                    <div className="topicPopoverSection">
                      <div className="topicPopoverLabel">{copy.topic.foundationPath}</div>
                      <div className="topicPopoverCopy topicPopoverPath">
                        {pathTitles.length > 0 ? pathTitles.join(" → ") : selectedTopic.title}
                      </div>
                    </div>
                    <div className="topicPopoverSection">
                      <div className="topicPopoverSectionHeader">
                        <div className="topicPopoverLabel">{copy.topic.resources}</div>
                        <button
                          className="topicPopoverInlineAddButton"
                          type="button"
                          aria-label={copy.topic.addResource}
                          title={copy.topic.addResource}
                          onClick={() => openTopicAssetDialog("resource")}
                        >
                          +
                        </button>
                      </div>
                      {selectedResourceLinks.length > 0 ? (
                        <div className="topicPopoverList">
                          {selectedResourceLinks
                            .map((resource) => ({ resource, safeUrl: safeExternalUrl(resource.url) }))
                            .filter((item): item is { resource: typeof selectedResourceLinks[number]; safeUrl: string } => Boolean(item.safeUrl))
                            .map(({ resource, safeUrl }) => (
                              <a key={resource.id} className="topicPopoverLink" href={safeUrl} rel="noopener noreferrer nofollow" target="_blank">
                                <span>{resource.label}</span>
                                <span className="topicPopoverLinkKind">{resource.kind}</span>
                              </a>
                            ))}
                        </div>
                      ) : (
                        <div className="mutedSmall">{copy.topic.noResources}</div>
                      )}
                    </div>
                    <div className="topicPopoverSection">
                      <div className="topicPopoverSectionHeader">
                        <div className="topicPopoverLabel">{copy.topic.artifacts}</div>
                        <button
                          className="topicPopoverInlineAddButton"
                          type="button"
                          aria-label={copy.topic.addArtifact}
                          title={copy.topic.addArtifact}
                          onClick={() => openTopicAssetDialog("artifact")}
                        >
                          +
                        </button>
                      </div>
                      {selectedArtifacts.length > 0 ? (
                        <div className="topicPopoverList">
                          {selectedArtifacts.map((artifact) => (
                            <div key={artifact.id} className="topicPopoverArtifact">
                              <div className="topicPopoverArtifactTitle">
                                <span>{artifact.title}</span>
                                <span className="topicPopoverArtifactKind">{artifact.kind}</span>
                              </div>
                              <div className="topicPopoverArtifactBody">{renderDisplayText(artifact.body || copy.topic.noArtifactBody)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mutedSmall">{copy.topic.noArtifacts}</div>
                      )}
                    </div>
                    {selectedClosureStatus ? (
                      <div className="topicPopoverSection">
                        <div className="topicPopoverLabel">{copy.topic.closure}</div>
                        {selectedClosureStatus.latest_attempt ? (
                          <div className="row" style={{ gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                            <span className="badge badge-gray">{copy.closure.latestQuiz(selectedClosureStatus.latest_attempt.score * 100)}</span>
                            <span className={`badge ${selectedClosureStatus.latest_attempt.passed ? "badge-green" : "badge-red"}`}>
                              {selectedClosureStatus.latest_attempt.passed ? copy.closure.passed : copy.closure.failed}
                            </span>
                            {!selectedClosureStatus.latest_attempt.passed && selectedClosureStatus.latest_attempt.fail_count > 0 ? (
                              <span className="badge badge-yellow">{copy.closure.failedCount(selectedClosureStatus.latest_attempt.fail_count)}</span>
                            ) : null}
                          </div>
                        ) : null}
                        {!closureTestsEnabled ? null : selectedClosureStatus.blocked_prerequisite_ids.length === 0 ? (
                          <div className="mutedSmall">{copy.topic.allClosed}</div>
                        ) : (
                          <div className="mutedSmall">{copy.topic.blockedCount(selectedClosureStatus.blocked_prerequisite_ids.length)}</div>
                        )}
                        {closureTestsEnabled && selectedClosureStatus.blocked_prerequisite_ids.length > 0 ? (
                          <div className="topicPopoverCopy">
                            {copy.closure.blockedBy}{" "}
                            {selectedClosureStatus.blocked_prerequisite_ids
                              .map((topicId) => topicTitlesById.get(topicId) ?? topicId)
                              .join(" · ")}
                          </div>
                        ) : null}
                        <div className="row topicClosureActions" style={{ justifyContent: "flex-end", gap: "8px" }}>
                          {quizError ? <span className="badge badge-red">{quizError}</span> : null}
                          {quizSuccess ? (
                            <span className={`badge ${quizSuccess === copy.closure.markAsFinished ? "badge-yellow" : "badge-green"}`}>
                              {quizSuccess}
                            </span>
                          ) : null}
                          {!(selectedTopicClosed && !closureTestsEnabled) ? (
                            <button
                              className={`assistantSendButton ${closureTestsEnabled ? "startQuizButton" : "markFinishedButton"}`}
                              disabled={quizLoading || (closureTestsEnabled && !selectedClosureStatus.can_award_completion)}
                              onClick={() => void (closureTestsEnabled ? startQuiz() : markTopicFinished())}
                              type="button"
                            >
                              {quizLoading
                                ? (closureTestsEnabled ? copy.closure.generatingQuiz : copy.closure.markingAsFinished)
                                : (closureTestsEnabled ? copy.closure.startClosureQuiz : copy.closure.markAsFinished)}
                            </button>
                          ) : null}
                          {closureTestsEnabled && !selectedClosureStatus.can_award_completion ? (
                            <div className="topicClosureBlockedHint">{copy.closure.closePrerequisitesFirst}</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {!experimentalLightDesktop ? (
          <aside
            className={`assistantDock ${assistantOpen ? "assistantDockOpen" : "assistantDockHidden"}`}
            style={{
              width: assistantOpen ? `${assistantWidth}px` : "0px",
              userSelect: assistantResizing ? "none" : "auto",
            }}
          >
            <div
              className="assistantDockResize"
              onMouseDown={(event) => {
                event.preventDefault();
                handleAssistantResize(event.clientX);
              }}
            />
            <div className="assistantDockHeader">
              <div>
                <div className="assistantDockTitleRow">
                  <div className="assistantDockTitle">
                    {assistantDisplayName}
                  </div>
                  <AssistantModelMenuTrigger
                    options={chatModelOptions}
                    selectedModel={selectedChatModel}
                    setSelectedModel={setSelectedChatModel}
                    ariaLabel={copy.sessions.modelPicker}
                  />
                </div>
                <div className="assistantDockSubtle">
                  {activeSession?.topic_id
                    ? copy.sessions.learningSession
                    : selectedTopic
                      ? copy.sessions.focusedOn(selectedTopic.title)
                      : activeGraph?.title ?? copy.sessions.noGraphSelected}
                </div>
              </div>
            </div>
            <div className="sessionListWrap" ref={sessionListWrapRef}>
              <div
                className="sessionList"
                ref={sessionListRef}
                onScroll={() => {
                  const el = sessionListRef.current;
                  const wrap = sessionListWrapRef.current;
                  if (!el || !wrap) return;
                  wrap.classList.toggle("scrolledLeft", el.scrollLeft > 4);
                  wrap.classList.toggle("scrolledRight", el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
                }}
                onMouseDown={(e) => {
                  if (!sessionListRef.current) return;
                  sessionDragRef.current = { startX: e.clientX, scrollLeft: sessionListRef.current.scrollLeft };
                }}
                onMouseMove={(e) => {
                  if (!sessionDragRef.current || !sessionListRef.current) return;
                  const dx = e.clientX - sessionDragRef.current.startX;
                  sessionListRef.current.scrollLeft = sessionDragRef.current.scrollLeft - dx;
                }}
                onMouseUp={() => { sessionDragRef.current = null; }}
                onMouseLeave={() => { sessionDragRef.current = null; }}
                onWheel={(e) => {
                  if (!sessionListRef.current) return;
                  if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
                    e.preventDefault();
                    sessionListRef.current.scrollLeft += e.deltaY;
                  }
                }}
              >
                <button
                  className={`sessionItem ${!activeSessionId ? "sessionItemActive" : ""}`}
                  onClick={() => setActiveSessionId(null)}
                  type="button"
                >
                  <span className="sessionItemLabel">{copy.sessions.general}</span>
                  <span className="sessionItemBadge">
                    {generalSession?.message_count ?? 0}
                  </span>
                </button>
                {topicSessions.map((session) => (
                  <div
                    key={session.session_id}
                    className={`sessionItemGroup ${activeSessionId === session.session_id ? "sessionItemGroupActive" : ""}`}
                  >
                    <button
                      className="sessionItemInline"
                      onClick={() => setActiveSessionId(session.session_id)}
                      type="button"
                    >
                      <span className="sessionItemLabel">{session.title ?? session.topic_id}</span>
                      <span className="sessionItemBadge">{session.message_count}</span>
                    </button>
                    <button
                      className="sessionDeleteBtn"
                      title={copy.sessions.deleteSession}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setSessionDeleteConfirm({ sessionId: session.session_id, title: session.title ?? session.topic_id ?? copy.sessions.fallbackSessionTitle });
                      }}
                      aria-label={copy.sessions.deleteSessionAria(session.title ?? session.topic_id ?? copy.sessions.fallbackSessionTitle)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedTopic && !chatSessions.find((session) => session.topic_id === selectedTopicId) ? (
                  <button
                    className="sessionItem sessionItemNew"
                    type="button"
                    onClick={async () => {
                      if (!activeGraph || !selectedTopicId) return;
                      const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/sessions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ topic_id: selectedTopicId, title: selectedTopic.title }),
                      });
                      if (!response.ok) return;
                      const session = await response.json();
                      setActiveSessionId(session.session_id);
                      void loadSessions();
                    }}
                  >
                    {copy.sessions.learnTopic(selectedTopic.title)}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="sessionShadow" />
            <div ref={chatViewportRef} className="assistantThread">
              {currentChatState.messages.length === 0 && !chatThreadLoading ? (
                <div className="assistantHello">
                  <div className="assistantHelloTitle">{copy.sessions.helloTitle}</div>
                  <div className="assistantHelloCopy">{copy.sessions.helloCopy}</div>
                </div>
              ) : null}
              {visibleMessages.length > 0 ? (
                visibleMessages.map((message) => {
                  const proposal = message.proposal;
                  const proposalCounts = proposal ? summarizePreviewCounts(proposal) : [];
                  const proposalHighlights = proposal ? summarizeTopOperations(proposal) : [];
                  return (
                    <div key={message.id} className={`chatMessage chatMessage-${message.role}`}>
                      <div className="chatBubble">
                        <div className="chatCopy">{renderDisplayText(message.content)}</div>
                        {message.inline_quiz ? (() => {
                          const quiz = message.inline_quiz;
                          const answered = quiz.answered_index != null;
                          return (
                            <div className="inlineQuizCard">
                              <div className="inlineQuizQuestion">{renderDisplayText(quiz.question)}</div>
                              <div className="inlineQuizChoices">
                                {quiz.choices.map((choice: string, idx: number) => {
                                  let cls = "inlineQuizChoice";
                                  if (answered) {
                                    if (idx === quiz.correct_index) cls += " inlineQuizCorrect";
                                    else if (idx === quiz.answered_index) cls += " inlineQuizWrong";
                                    else cls += " inlineQuizDimmed";
                                  }
                                  return (
                                    <button
                                      key={idx}
                                      className={cls}
                                      type="button"
                                      disabled={answered || chatLoading}
                                      onClick={() => {
                                        const answeredMessages = currentChatState.messages.map((entry) =>
                                          entry.id === message.id && entry.inline_quiz
                                            ? { ...entry, inline_quiz: { ...entry.inline_quiz, answered_index: idx } }
                                            : entry,
                                        );
                                        updateCurrentChatState((prev) => ({
                                          ...prev,
                                          messages: answeredMessages,
                                        }));
                                      }}
                                    >
                                      {renderDisplayText(choice)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })() : null}
                        {message.role === "assistant" && message.fallback_used ? (
                          <div className="chatMetaRow">
                            <span className="badge badge-yellow">{copy.sessions.fallbackUsed}</span>
                          </div>
                        ) : null}
                        {message.planning_status ? (
                          <div className="proposalInlineCard proposalInlinePending">
                            <div className="proposalInlinePendingRow">
                              <div className="proposalInlinePendingLabel">{message.planning_status}</div>
                              <div className="proposalInlinePendingDots" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {message.planning_error ? (
                          <div className="inlineNotice inlineNoticeError">{message.planning_error}</div>
                        ) : null}
                        {proposal ? (
                          <div className="proposalInlineCard">
                            <div className="proposalInlineHead">
                              <div>
                                <div className="proposalInlineTitle">{proposal.display.summary}</div>
                                {proposal.proposal_envelope.assistant_message ? (
                                  <div className="mutedSmall">{proposal.proposal_envelope.assistant_message}</div>
                                ) : null}
                              </div>
                              <button
                                className={`proposalAddButton${message.proposal_applied ? " proposalAddButtonApplied" : ""}`}
                                disabled={
                                  applyLoadingMessageId === message.id ||
                                  message.proposal_applied ||
                                  !proposal.apply_plan.validation.ok
                                }
                                onClick={() => void applyProposalFromMessage(message.id, proposal)}
                                type="button"
                                aria-label={message.proposal_applied ? copy.sessions.proposalApplied : copy.sessions.addProposalToGraph}
                                title={message.proposal_applied ? copy.sessions.applied : copy.sessions.addProposalToGraph}
                              >
                                {applyLoadingMessageId === message.id ? "…" : message.proposal_applied ? <span className="proposalAppliedMark" aria-hidden="true"><Check size={12} weight="bold" /></span> : "+"}
                              </button>
                            </div>
                            {proposalCounts.length > 0 ? (
                              <div className="previewStatGrid">
                                {proposalCounts.map((item) => (
                                  <div key={item.label} className="previewStatCard">
                                    <strong>{item.value}</strong>
                                    <span>{item.label}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {proposalHighlights.length > 0 ? (
                              <div className="proposalMiniList">
                                {proposalHighlights.map((item, index) => (
                                  <button
                                    key={`${item.label}-${item.target}-${index}`}
                                    className="proposalMiniItem"
                                    type="button"
                                    onClick={() => {
                                      updateCurrentChatState((current) => ({
                                        ...current,
                                        input: `Expand from topic ${item.target} to topic: `,
                                      }));
                                      window.requestAnimationFrame(() => chatComposerRef.current?.focus());
                                    }}
                                  >
                                    <span>{item.target}</span>
                                    <span className="badge badge-gray">{item.label}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {proposal.apply_plan.validation.errors.length > 0 ? (
                              <div className="stackCompact">
                                {proposal.apply_plan.validation.errors.map((entry) => (
                                  <div key={entry} className="inlineNotice inlineNoticeError">
                                    {entry}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {proposal.apply_plan.validation.warnings.length > 0 ? (
                              <div className="stackCompact">
                                {proposal.apply_plan.validation.warnings.map((entry) => (
                                  <div key={entry} className="inlineNotice inlineNoticeWarn">
                                    {entry}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : null}
              {chatLoading && !hasInlinePlanningWidget ? (
                <div className="chatMessage chatMessage-assistant">
                  <div className="chatBubble chatBubbleLoading">
                    <span className="chatTypingDot" />
                    <span className="chatTypingDot" />
                    <span className="chatTypingDot" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="assistantComposerWrap">
              {chatError ? <div className="inlineNotice inlineNoticeError">{chatError}</div> : null}
              {chatSessionsError ? <div className="inlineNotice inlineNoticeError">{chatSessionsError}</div> : null}
              {applyError ? <div className="inlineNotice inlineNoticeError">{applyError}</div> : null}
              <div className="assistantTemplates">
                <button
                  className={`assistantTemplate webGroundingToggle ${composerUseGrounding ? "active" : ""}`}
                  onClick={() => setComposerUseGrounding((current) => !current)}
                  title={copy.sessions.groundingToggle}
                  type="button"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                  Web
                </button>
                {assistantTemplates.map((template) => (
                  <button
                    key={template.id}
                    className="assistantTemplate"
                    onClick={() => {
                      updateCurrentChatState((current) => ({
                        ...current,
                        input: template.value,
                      }));
                      window.requestAnimationFrame(() => chatComposerRef.current?.focus());
                    }}
                    type="button"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
              <div className="assistantComposer">
                <textarea
                  ref={chatComposerRef}
                  className="assistantInput"
                  value={currentChatState.input}
                  onChange={(event) =>
                    updateCurrentChatState((current) => ({
                      ...current,
                      input: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder={copy.sessions.composerPlaceholder}
                />
                <button
                  className="assistantSendButton assistantSendButtonIcon"
                  disabled={chatLoading || chatThreadLoading || !currentChatState.input.trim()}
                  onClick={() => void sendChat()}
                  type="button"
                >
                  {chatLoading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                      <path d="M12 2a10 10 0 0 1 10 10"></path>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5"></path>
                      <path d="M5 12L12 5L19 12"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </aside>
          ) : null}

          {experimentalLightDesktop ? (
            <>
              <div
                ref={dockRef}
                className="lightDock lightFloatingWindowEnter"
                style={{ left: `${dockPosition.x}px`, top: `${dockPosition.y}px` }}
              >
                <div className="lightDockGrip" onPointerDown={(event) => beginFloatingDrag("dock", event)} />
                <button
                  className={`lightDockButton ${lightWorkspacePanelOpen ? "lightDockButtonActive" : ""}`}
                  onClick={toggleExperimentalWorkspaceWindow}
                  title={copy.shell.workspace}
                  type="button"
                >
                  <SquaresFour size={28} weight={getDockIconWeight(lightWorkspacePanelOpen)} />
                </button>
                <button
                  className={`lightDockButton ${lightChatPanelOpen ? "lightDockButtonActive" : ""}`}
                  onClick={toggleExperimentalChatWindow}
                  title={copy.shell.chat}
                  type="button"
                >
                  <ChatCircleDots size={28} weight={getDockIconWeight(lightChatPanelOpen)} />
                </button>
                <button className={`lightDockButton ${isSettingsOpen ? "lightDockButtonActive" : ""}`} onClick={openConfigurationSettings} title={copy.shell.configuration} type="button">
                  <GearSix size={28} weight={getDockIconWeight(isSettingsOpen)} />
                </button>
                <a className="lightDockButton lightDockButtonLink" href="https://mapmind.space/how-to-use" rel="noreferrer" target="_blank" title={copy.sidebar.documentation}>
                  <BookBookmark size={28} weight={getDockIconWeight(false)} />
                </a>
                {debugModeEnabled ? (
                  <button className={`lightDockButton ${isLogsOpen ? "lightDockButtonActive" : ""}`} onClick={openDebugLogs} title={copy.sidebar.logs} type="button">
                    <BugBeetle size={28} weight={getDockIconWeight(isLogsOpen)} />
                  </button>
                ) : null}
              </div>
              {lightWorkspaceWindow}
              {lightChatWindow}
            </>
          ) : null}
        </div>

        {isMobileViewport ? (
          <div className="mobileDock">
            <button
              className="mobileDockItem mobileDockItemActive"
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
              }}
            >
              <span className="mobileDockLabel">{copy.shell.workspace}</span>
            </button>
            {activeGraph ? (
              <button
                className={`mobileDockItem mobileDockItemChat ${assistantOpen ? "mobileDockItemActive" : ""}`}
                type="button"
                onClick={() => {
                  if (modalSurfaceLocked) {
                    closeOverlaySurfaces();
                  }
                  setMobileMenuOpen(false);
                  setAssistantWidth((current) => {
                    const opening = current < ASSISTANT_MIN_WIDTH;
                    if (opening) {
                      return 360;
                    }
                    return 0;
                  });
                }}
              >
                <span className="mobileDockLabel">{copy.shell.chat}</span>
              </button>
            ) : null}
            <button
              className={`mobileDockItem ${mobileMenuOpen ? "mobileDockItemActive" : ""}`}
              type="button"
              onClick={() => {
                if (modalSurfaceLocked) {
                  closeOverlaySurfaces();
                }
                setMobileMenuOpen((current) => !current);
              }}
            >
              <span className="mobileDockLabel">{copy.shell.menu}</span>
            </button>
          </div>
        ) : null}
        {isMobileViewport && mobileMenuOpen ? (
          <>
            <button
              className="mobileMenuBackdrop"
              type="button"
              aria-label={copy.settingsPanel.closeSettings}
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="mobileMenuSheet" role="dialog" aria-modal="true" aria-label={copy.shell.mobileMenuAria}>
              <div className="mobileMenuSheetHeader">
                <div className="sidebarAvatar">{sessionUser?.avatar_url ? <img src={sessionUser.avatar_url} alt="" className="sidebarAvatarImg" /> : userInitials(sessionUser?.name)}</div>
                <div className="mobileMenuSheetMeta">
                  <span className="mobileMenuSheetName">{sessionUser?.name ?? copy.shell.authenticatedUser}</span>
                  <span className="mobileMenuSheetEmail">{sessionUser?.email ?? copy.shell.noEmail}</span>
                </div>
                <button
                  className="mobileMenuCloseButton"
                  type="button"
                  aria-label={copy.settingsPanel.closeSettings}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  ✕
                </button>
              </div>
              <button className="sidebarAccountPopoverItem" type="button" onClick={openConfigurationSettings}>
                <GearSix size={14} weight="bold" className="sidebarIcon" /> {copy.shell.configuration}
              </button>
            </div>
          </>
        ) : null}
      </main>
      {topicAssetDialog ? (
        <TopicAssetModal
          topicAssetDialog={topicAssetDialog}
          themeMode={themeMode}
          topicAssetModalRef={topicAssetModalRef}
          closeTopicAssetModal={closeTopicAssetModal}
          copy={copy}
          topicAssetPrimaryInputRef={topicAssetPrimaryInputRef}
          topicResourceUrlDraft={topicResourceUrlDraft}
          setTopicResourceUrlDraft={setTopicResourceUrlDraft}
          topicArtifactTitleDraft={topicArtifactTitleDraft}
          setTopicArtifactTitleDraft={setTopicArtifactTitleDraft}
          topicArtifactBodyDraft={topicArtifactBodyDraft}
          setTopicArtifactBodyDraft={setTopicArtifactBodyDraft}
          topicAssetError={topicAssetError}
          topicAssetSaving={topicAssetSaving}
          submitTopicAssetDialog={submitTopicAssetDialog}
        />
      ) : null}
    </>
  );
}
