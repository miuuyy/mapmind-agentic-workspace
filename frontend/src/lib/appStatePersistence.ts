import {
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  ASSISTANT_WIDTH_STORAGE_KEY,
  type ThemeMode,
} from "./appContracts";
import type { ChatMessage } from "./types";

export const VIEWPORT_CENTERED_ZOOM_STORAGE_KEY = "knowledge_graph_viewport_centered_zoom_v1";
export const CURVED_EDGE_LINES_STORAGE_KEY = "knowledge_graph_curved_edge_lines_v1";
export const COMPACT_TOP_OVERLAY_THRESHOLD = 960;
export const ACTIVE_CHAT_SESSION_STORAGE_KEY = "knowledge_graph_active_chat_session_v1";
export const THEME_MODE_STORAGE_KEY = "knowledge_graph_theme_mode_v1";
export const LEFT_SIDEBAR_OPEN_STORAGE_KEY = "knowledge_graph_left_sidebar_open_v1";
export const SETTINGS_OPEN_STORAGE_KEY = "knowledge_graph_settings_open_v1";
export const LOGS_OPEN_STORAGE_KEY = "knowledge_graph_logs_open_v1";
export const MOBILE_LAYOUT_BREAKPOINT = 1180;

export function activeChatSessionStorageKey(graphId: string): string {
  return `${ACTIVE_CHAT_SESSION_STORAGE_KEY}:${graphId}`;
}

export function readStoredActiveChatSession(graphId: string): string | null {
  try {
    const raw = localStorage.getItem(activeChatSessionStorageKey(graphId));
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // Ignore invalid stored boolean values.
  }
  return fallback;
}

export function readStoredAssistantWidth(): number {
  try {
    const saved = localStorage.getItem(ASSISTANT_WIDTH_STORAGE_KEY);
    if (!saved) return 390;
    const width = Number.parseInt(saved, 10);
    if (Number.isFinite(width)) {
      const normalized = Math.max(0, Math.min(ASSISTANT_MAX_WIDTH, width));
      return normalized < ASSISTANT_MIN_WIDTH ? 0 : normalized;
    }
  } catch {
    // Ignore invalid persisted width values.
  }
  return 390;
}

export function readStoredViewportCenteredZoom(): boolean {
  try {
    return localStorage.getItem(VIEWPORT_CENTERED_ZOOM_STORAGE_KEY) === "1";
  } catch {
    return false;
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

export function reconcileThreadMessages(serverMessages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  if (localMessages.length === 0) return serverMessages;
  if (serverMessages.length === 0) return localMessages;
  if (serverThreadIsStaleSubset(serverMessages, localMessages)) return localMessages;
  return serverMessages;
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return raw === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const mode = readStoredThemeMode();
  document.documentElement.dataset.theme = mode;
  return mode;
}

export function readStoredCurvedEdgeLines(): boolean {
  try {
    const raw = localStorage.getItem(CURVED_EDGE_LINES_STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return false;
  } catch {
    return false;
  }
}
