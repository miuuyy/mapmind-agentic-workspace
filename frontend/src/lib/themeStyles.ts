import type { ThemeMode } from "./appContracts";

import darkThemeHref from "../styles/dark-theme.css?url";
import lightThemeHref from "../styles/light-theme.css?url";

const THEME_STYLESHEET_ID = "clew-theme-stylesheet";

export function themeStylesheetHref(mode: ThemeMode): string {
  return mode === "light" ? lightThemeHref : darkThemeHref;
}

export function ensureThemeStylesheet(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const href = themeStylesheetHref(mode);
  let link = document.getElementById(THEME_STYLESHEET_ID) as HTMLLinkElement | null;
  if (!(link instanceof HTMLLinkElement)) {
    link = document.createElement("link");
    link.id = THEME_STYLESHEET_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}
