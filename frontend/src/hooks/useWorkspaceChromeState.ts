import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  APP_FAVICON_DARK_SRC,
  APP_FAVICON_LIGHT_SRC,
  ASSISTANT_MIN_WIDTH,
  ASSISTANT_WIDTH_STORAGE_KEY,
  type ThemeMode,
} from "../lib/appContracts";
import {
  LEFT_SIDEBAR_OPEN_STORAGE_KEY,
  LOGS_OPEN_STORAGE_KEY,
  MOBILE_LAYOUT_BREAKPOINT,
  SETTINGS_OPEN_STORAGE_KEY,
  STRAIGHT_EDGE_LINES_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  VIEWPORT_CENTERED_ZOOM_STORAGE_KEY,
  readInitialThemeMode,
  readStoredAssistantWidth,
  readStoredBoolean,
  readStoredStraightEdgeLines,
  readStoredViewportCenteredZoom,
} from "../lib/appStatePersistence";
import { ensureThemeStylesheet } from "../lib/themeStyles";
import { usePersistedBoolean, usePersistedNumber, usePersistedString } from "../lib/usePersistedState";

export function useWorkspaceChromeState(): {
  assistantWidth: number;
  setAssistantWidth: Dispatch<SetStateAction<number>>;
  isMobileViewport: boolean;
  viewportWidth: number;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: Dispatch<SetStateAction<boolean>>;
  leftSidebarClosing: boolean;
  setLeftSidebarClosing: Dispatch<SetStateAction<boolean>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  isSettingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  isLogsOpen: boolean;
  setLogsOpen: Dispatch<SetStateAction<boolean>>;
  viewportCenteredZoom: boolean;
  setViewportCenteredZoom: Dispatch<SetStateAction<boolean>>;
  straightEdgeLinesEnabled: boolean;
  setStraightEdgeLinesEnabled: Dispatch<SetStateAction<boolean>>;
  initialThemeMode: ThemeMode;
  themeModeDraft: ThemeMode;
  setThemeModeDraft: Dispatch<SetStateAction<ThemeMode>>;
} {
  const [assistantWidth, setAssistantWidth] = useState<number>(readStoredAssistantWidth);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() => readStoredBoolean(LEFT_SIDEBAR_OPEN_STORAGE_KEY, true));
  const [leftSidebarClosing, setLeftSidebarClosing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(() => readStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, false));
  const [isLogsOpen, setLogsOpen] = useState(() => readStoredBoolean(LOGS_OPEN_STORAGE_KEY, false));
  const [viewportCenteredZoom, setViewportCenteredZoom] = useState(readStoredViewportCenteredZoom);
  const [straightEdgeLinesEnabled, setStraightEdgeLinesEnabled] = useState<boolean>(readStoredStraightEdgeLines);
  const initialThemeMode = useMemo<ThemeMode>(readInitialThemeMode, []);
  const [themeModeDraft, setThemeModeDraft] = useState<ThemeMode>(initialThemeMode);
  const wasMobileViewportRef = useRef(false);

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

  useEffect(() => {
    if (wasMobileViewportRef.current && !isMobileViewport) {
      setLeftSidebarOpen(true);
      setLeftSidebarClosing(false);
      setAssistantWidth((current) => (current < ASSISTANT_MIN_WIDTH ? 390 : current));
    }
    wasMobileViewportRef.current = isMobileViewport;
  }, [isMobileViewport]);

  usePersistedNumber(ASSISTANT_WIDTH_STORAGE_KEY, assistantWidth);
  usePersistedBoolean(LEFT_SIDEBAR_OPEN_STORAGE_KEY, leftSidebarOpen);
  usePersistedBoolean(SETTINGS_OPEN_STORAGE_KEY, isSettingsOpen);
  usePersistedBoolean(LOGS_OPEN_STORAGE_KEY, isLogsOpen);
  usePersistedBoolean(VIEWPORT_CENTERED_ZOOM_STORAGE_KEY, viewportCenteredZoom);
  usePersistedBoolean(STRAIGHT_EDGE_LINES_STORAGE_KEY, straightEdgeLinesEnabled);
  usePersistedString(THEME_MODE_STORAGE_KEY, themeModeDraft);

  useEffect(() => {
    document.documentElement.dataset.theme = themeModeDraft;
    ensureThemeStylesheet(themeModeDraft);
    const faviconHref = themeModeDraft === "light" ? APP_FAVICON_LIGHT_SRC : APP_FAVICON_DARK_SRC;
    const iconLink = document.querySelector('link[rel="icon"]');
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (iconLink instanceof HTMLLinkElement) {
      iconLink.href = faviconHref;
    }
    if (appleTouchIcon instanceof HTMLLinkElement) {
      appleTouchIcon.href = faviconHref;
    }
  }, [themeModeDraft]);

  return {
    assistantWidth,
    setAssistantWidth,
    isMobileViewport,
    viewportWidth,
    leftSidebarOpen,
    setLeftSidebarOpen,
    leftSidebarClosing,
    setLeftSidebarClosing,
    mobileMenuOpen,
    setMobileMenuOpen,
    isSettingsOpen,
    setSettingsOpen,
    isLogsOpen,
    setLogsOpen,
    viewportCenteredZoom,
    setViewportCenteredZoom,
    straightEdgeLinesEnabled,
    setStraightEdgeLinesEnabled,
    initialThemeMode,
    themeModeDraft,
    setThemeModeDraft,
  };
}
