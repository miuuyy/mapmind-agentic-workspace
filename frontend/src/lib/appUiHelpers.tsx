import React from "react";

import type { TopicAnchorPoint } from "../components/GraphCanvas";
import { API_BASE } from "./api";
import { recordApiDebugLog } from "./debugLogs";
import type { GraphEnvelope } from "./types";

type ApiErrorPayload = {
  detail?: string | { errors?: string[]; warnings?: string[] };
};

export type ManualLayoutPositions = Record<string, { x: number; y: number }>;

export type PopoverPosition = {
  left: number;
  top: number;
  side: "left" | "right";
};

export function samePopoverPosition(
  current: PopoverPosition | null,
  next: PopoverPosition | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.side === next.side && Math.abs(current.left - next.left) < 0.75 && Math.abs(current.top - next.top) < 0.75;
}

export function shouldKeepCurrentAnchor(current: TopicAnchorPoint | null, next: TopicAnchorPoint | null): boolean {
  if (!current || !next) return false;
  return (
    current.side === next.side &&
    Math.abs(current.x - next.x) < 8 &&
    Math.abs(current.y - next.y) < 8
  );
}

export function shouldCommitAnchorUpdate(
  current: TopicAnchorPoint | null,
  next: TopicAnchorPoint | null,
  elapsedMs: number,
): boolean {
  if (!next) return true;
  if (!current) return true;
  if (current.side !== next.side) return true;
  const dx = Math.abs(current.x - next.x);
  const dy = Math.abs(current.y - next.y);
  const majorShift = dx > 28 || dy > 28;
  const mediumShift = dx > 10 || dy > 10;
  if (majorShift) return true;
  if (mediumShift && elapsedMs > 120) return true;
  return elapsedMs > 260;
}

export function userInitials(name: string | null | undefined): string {
  if (!name) return "KG";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "KG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function requiredCorrectAnswers(passThreshold: number, questionCount: number): number {
  return Math.min(questionCount, Math.max(1, Math.ceil(passThreshold * questionCount - 1e-9)));
}

export function readManualLayoutPositions(graph: GraphEnvelope | null): ManualLayoutPositions | null {
  if (!graph) return null;
  if (graph.metadata?.manual_layout_version !== 2) return null;
  const raw = graph.metadata?.manual_layout_positions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const positions: ManualLayoutPositions = {};
  for (const [topicId, point] of Object.entries(raw)) {
    if (!point || typeof point !== "object" || Array.isArray(point)) continue;
    const x = Number((point as { x?: unknown }).x);
    const y = Number((point as { y?: unknown }).y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    positions[topicId] = { x, y };
  }
  return Object.keys(positions).length > 0 ? positions : null;
}

function sanitizeDisplayText(value: string): string {
  const lines = value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^"difficulty"\s*:/.test(trimmed)) return false;
      if (/^"estimated_minutes"\s*:/.test(trimmed)) return false;
      if (/^"confidence"\s*:/.test(trimmed)) return false;
      if (/^[{}[\],]+$/.test(trimmed)) return false;
      return true;
    });
  return lines.join("\n").trim();
}

export function renderDisplayText(value: string): React.ReactNode {
  const normalized = sanitizeDisplayText(value) || value;
  const lines = normalized.split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
              <strong key={`part-${lineIndex}-${partIndex}`} className="chatEmphasis">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return (
              <strong key={`part-${lineIndex}-${partIndex}`} className="chatEmphasis">
                {part.slice(1, -1)}
              </strong>
            );
          }
          return <React.Fragment key={`part-${lineIndex}-${partIndex}`}>{part}</React.Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object") {
    const errors = Array.isArray(detail.errors) ? detail.errors.filter(Boolean) : [];
    const warnings = Array.isArray(detail.warnings) ? detail.warnings.filter(Boolean) : [];
    const parts = [...errors, ...warnings];
    if (parts.length > 0) return parts.join("; ");
  }
  return fallback;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const request = new Request(input, {
    ...(init ?? {}),
    credentials: "include",
  });
  const requestBody = typeof init?.body === "string" ? init.body : null;
  try {
    const response = await fetch(request);
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    const contentType = response.headers.get("content-type") ?? "";
    const isStream =
      contentType.includes("text/event-stream")
      || contentType.includes("application/x-ndjson")
      || contentType.includes("application/ndjson");
    const responseBody = isStream ? "[stream response]" : await response.clone().text().catch(() => null);
    await recordApiDebugLog({
      url: request.url,
      method: request.method,
      statusCode: response.status,
      durationMs,
      ok: response.ok,
      requestBody,
      responseBody,
    });
    return response;
  } catch (error) {
    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    await recordApiDebugLog({
      url: request.url,
      method: request.method,
      statusCode: null,
      durationMs,
      ok: false,
      requestBody,
      errorMessage: error instanceof Error ? error.message : "Network request failed",
    });
    throw error;
  }
}

export function computePopoverPosition(
  anchor: TopicAnchorPoint | null,
  shell: HTMLDivElement | null,
  popover: HTMLDivElement | null,
): PopoverPosition | null {
  if (!anchor || !shell) return null;
  const shellRect = shell.getBoundingClientRect();
  const popoverWidth = popover?.offsetWidth ?? 380;
  const popoverHeight = popover?.offsetHeight ?? 320;
  const gap = 18;
  const margin = 16;

  let left = anchor.side === "left" ? anchor.x - popoverWidth - gap : anchor.x + gap;
  let top = anchor.y - popoverHeight / 2;

  left = Math.max(margin, Math.min(shellRect.width - popoverWidth - margin, left));
  top = Math.max(margin, Math.min(shellRect.height - popoverHeight - margin, top));

  return { left, top, side: anchor.side };
}

export function makeMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2, 10)}`;
}
