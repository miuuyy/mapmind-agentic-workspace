import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { API_BASE } from "../lib/api";
import { activeChatSessionStorageKey, readStoredActiveChatSession } from "../lib/appStatePersistence";
import { apiFetch, makeMessageId } from "../lib/appUiHelpers";
import { fetchChatSessions, reconcileThreadMessages } from "../lib/chatRequests";
import { recentMessagesForContext } from "../lib/graph";
import type { GraphChatState } from "../lib/appContracts";
import type {
  ChatMessage,
  ChatSessionSummary,
  GraphChatStreamEvent,
  GraphChatThread,
  GraphEnvelope,
} from "../lib/types";

type GraphChatControllerParams = {
  activeGraph: GraphEnvelope | null;
  selectedTopicId: string | null;
  selectedChatModel: string | null;
  defaultModel: string | null;
  memoryHistoryMessageLimit: number;
  composerUseGrounding: boolean;
  largeGraphModelHint: string;
  loadChatError: string;
  loadChatSessionsError: string;
};

function chatStateKey(graphId: string, sessionId: string | null): string {
  return `${graphId}:${sessionId ?? "general"}`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatMessage>;
  return (
    typeof candidate.id === "string" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.created_at === "string"
  );
}

export function assistantMessageFromStreamEvent(
  event: Extract<GraphChatStreamEvent, { type: "assistant_message" }>,
): ChatMessage | null {
  if (isChatMessage(event.message)) return event.message;
  const lastMessage = event.messages && event.messages.length > 0 ? event.messages[event.messages.length - 1] : null;
  return isChatMessage(lastMessage) ? lastMessage : null;
}

export function useGraphChatController({
  activeGraph,
  selectedTopicId,
  selectedChatModel,
  defaultModel,
  memoryHistoryMessageLimit,
  composerUseGrounding,
  largeGraphModelHint,
  loadChatError,
  loadChatSessionsError,
}: GraphChatControllerParams): {
  activeSessionId: string | null;
  setActiveSessionId: Dispatch<SetStateAction<string | null>>;
  chatSessions: ChatSessionSummary[];
  currentChatState: GraphChatState;
  chatLoading: boolean;
  chatThreadLoading: boolean;
  chatError: string | null;
  chatSessionsError: string | null;
  updateCurrentChatState: (updater: (current: GraphChatState) => GraphChatState) => void;
  clearChatStateForGraph: (graphId: string | null | undefined) => void;
  loadSessions: () => Promise<void>;
  sendChat: (overridePrompt?: string, options?: { hiddenUserMessage?: boolean; baseMessages?: ChatMessage[] }) => Promise<void>;
} {
  const [chatByGraph, setChatByGraph] = useState<Record<string, GraphChatState>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const [chatThreadLoading, setChatThreadLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatSessionsError, setChatSessionsError] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeGraphId = activeGraph?.graph_id ?? null;

  const currentChatState = useMemo<GraphChatState>(() => {
    if (!activeGraphId) return { input: "", messages: [] };
    return chatByGraph[chatStateKey(activeGraphId, activeSessionId)] ?? { input: "", messages: [] };
  }, [activeGraphId, activeSessionId, chatByGraph]);

  const updateCurrentChatState = useCallback(
    (updater: (current: GraphChatState) => GraphChatState): void => {
      if (!activeGraphId) return;
      const stateKey = chatStateKey(activeGraphId, activeSessionId);
      setChatByGraph((current) => {
        const graphState = current[stateKey] ?? { input: "", messages: [] };
        return {
          ...current,
          [stateKey]: updater(graphState),
        };
      });
    },
    [activeGraphId, activeSessionId],
  );

  const clearChatStateForGraph = useCallback((graphId: string | null | undefined): void => {
    if (!graphId) return;
    setChatByGraph((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${graphId}:`)) delete next[key];
      }
      return next;
    });
  }, []);

  const loadSessions = useCallback(async (): Promise<void> => {
    if (!activeGraphId) return;
    setChatSessionsError(null);
    try {
      const sessions = await fetchChatSessions(
        apiFetch,
        `${API_BASE}/api/v1/graphs/${activeGraphId}/chat/sessions`,
        loadChatSessionsError,
      );
      setChatSessions(sessions);
    } catch (loadError) {
      setChatSessionsError(loadError instanceof Error ? loadError.message : loadChatSessionsError);
    }
  }, [activeGraphId, loadChatSessionsError]);

  const formatPlanningError = useCallback(
    (detail: string): string => {
      const normalized = detail.trim();
      if (!normalized) return normalized;
      const isProposalFailure = normalized.toLowerCase().includes("proposal generation failed");
      if (!isProposalFailure || normalized.includes(largeGraphModelHint)) return normalized;
      return `${normalized}\n${largeGraphModelHint}`;
    },
    [largeGraphModelHint],
  );

  useEffect(() => {
    if (!activeGraphId) return;
    try {
      if (activeSessionId) {
        localStorage.setItem(activeChatSessionStorageKey(activeGraphId), activeSessionId);
      } else {
        localStorage.removeItem(activeChatSessionStorageKey(activeGraphId));
      }
    } catch {
      // Ignore localStorage write failures.
    }
  }, [activeGraphId, activeSessionId]);

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
          const stateKey = chatStateKey(graphId, activeSessionId);
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
        setChatError(loadError instanceof Error ? loadError.message : loadChatError);
      } finally {
        if (!cancelled) setChatThreadLoading(false);
      }
    }

    if (!activeGraphId) return;
    void loadChatThread(activeGraphId);
    return () => {
      cancelled = true;
    };
  }, [activeGraphId, activeSessionId, loadChatError]);

  useEffect(() => {
    setChatSessions([]);
    setChatSessionsError(null);
    if (!activeGraphId) {
      setActiveSessionId(null);
      return;
    }
    setActiveSessionId(readStoredActiveChatSession(activeGraphId));
    void loadSessions();
  }, [activeGraphId, loadSessions]);

  const sendChat = useCallback(
    async (overridePrompt?: string, options?: { hiddenUserMessage?: boolean; baseMessages?: ChatMessage[] }): Promise<void> => {
      if (!activeGraphId) return;
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
        const response = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraphId}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            messages: recentMessagesForContext(nextMessages, memoryHistoryMessageLimit).map((message) => ({
              role: message.role,
              content: message.content,
              hidden: message.hidden ?? false,
              created_at: message.created_at,
            })),
            hidden_user_message: hiddenUserMessage,
            selected_topic_id: activeSessionId
              ? chatSessions.find((session) => session.session_id === activeSessionId)?.topic_id ?? selectedTopicId
              : selectedTopicId,
            session_id: activeSessionId,
            model: selectedChatModel ?? defaultModel,
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
              const assistantMessage = assistantMessageFromStreamEvent(event);
              if (!assistantMessage) {
                throw new Error("chat stream assistant_message missing message");
              }
              updateCurrentChatState((current) => ({
                ...current,
                messages: [...current.messages, assistantMessage],
              }));
              if (assistantMessage.action === "answer") {
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
                    ? { ...message, planning_status: null, planning_error: formatPlanningError(event.detail) }
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
    },
    [
      activeGraphId,
      activeSessionId,
      chatSessions,
      composerUseGrounding,
      currentChatState.input,
      currentChatState.messages,
      defaultModel,
      formatPlanningError,
      loadSessions,
      memoryHistoryMessageLimit,
      selectedChatModel,
      selectedTopicId,
      updateCurrentChatState,
    ],
  );

  return {
    activeSessionId,
    setActiveSessionId,
    chatSessions,
    currentChatState,
    chatLoading,
    chatThreadLoading,
    chatError,
    chatSessionsError,
    updateCurrentChatState,
    clearChatStateForGraph,
    loadSessions,
    sendChat,
  };
}
