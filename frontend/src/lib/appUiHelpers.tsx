import React from "react";

import type { TopicAnchorPoint } from "../components/GraphCanvas";
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

const GREEK_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Epsilon: "Ε",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
};

const LATEX_COMMAND_SYMBOLS: Record<string, string> = {
  sum: "∑",
  prod: "∏",
  int: "∫",
  oint: "∮",
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  pm: "±",
  mp: "∓",
  cdot: "·",
  cdots: "⋯",
  ldots: "…",
  times: "×",
  div: "÷",
  ast: "∗",
  star: "⋆",
  circ: "∘",
  bullet: "•",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  mapsto: "↦",
  approx: "≈",
  neq: "≠",
  equiv: "≡",
  leq: "≤",
  geq: "≥",
  ll: "≪",
  gg: "≫",
  subset: "⊂",
  supset: "⊃",
  subseteq: "⊆",
  supseteq: "⊇",
  in: "∈",
  notin: "∉",
  ni: "∋",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  forall: "∀",
  exists: "∃",
  neg: "¬",
  land: "∧",
  lor: "∨",
  Re: "ℜ",
  Im: "ℑ",
  hbar: "ℏ",
  ell: "ℓ",
  aleph: "ℵ",
  degree: "°",
  prime: "′",
  dprime: "″",
};

const GREEK_WORD_RE = /\b(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)\b/gi;
const MATHISH_TOKEN_RE = /([A-Za-z]+(?:_\{[^}]+\}|_[A-Za-z0-9+\-*/=()]+|\^\{[^}]+\}|\^[A-Za-z0-9+\-*/=()]+)+)|((?<!\w)[A-Za-z0-9.]+\s*\/\s*[A-Za-z0-9.]+(?!\w))|(\b(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)\b)/gi;

function preprocessLatex(value: string): string {
  if (!value) return value;
  let out = value;
  // \frac{a}{b} -> a/b so renderFractionToken can pick it up
  out = out.replace(/\\(?:d?frac|tfrac|cfrac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, (_, a, b) => `${a.trim()}/${b.trim()}`);
  // \sqrt{x} -> √(x)
  out = out.replace(/\\sqrt\s*\{([^{}]+)\}/g, (_, inner) => `√(${inner})`);
  // \sqrt[n]{x} -> ⁿ√(x)
  out = out.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]+)\}/g, (_, n, inner) => `${n}√(${inner})`);
  // \text{...} -> just the inner text
  out = out.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]+)\}/g, (_, inner) => inner);
  // \left( \right) and similar — strip the \left / \right
  out = out.replace(/\\left\s*([(\[{|])/g, "$1");
  out = out.replace(/\\right\s*([)\]}|])/g, "$1");
  // bare LaTeX commands -> unicode symbols
  out = out.replace(/\\([A-Za-z]+)/g, (token, name: string) => {
    const symbol = LATEX_COMMAND_SYMBOLS[name];
    if (symbol) return symbol;
    // Greek lookup
    const lower = name.toLowerCase();
    if (GREEK_SYMBOLS[name]) return GREEK_SYMBOLS[name];
    if (GREEK_SYMBOLS[lower]) return GREEK_SYMBOLS[lower];
    return token;
  });
  // strip math delimiters: $$...$$ and $...$ just become inline text — existing
  // mathish tokens (x_1, x^2, a/b, greek words) still get picked up by MATHISH_TOKEN_RE
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => inner);
  out = out.replace(/\$([^$\n]+?)\$/g, (_, inner) => inner);
  return out;
}

function replaceGreekWords(value: string): string {
  return value.replace(GREEK_WORD_RE, (token) => GREEK_SYMBOLS[token.toLowerCase()] ?? token);
}

function renderScriptedToken(token: string, key: string): React.ReactNode {
  const baseMatch = token.match(/^[A-Za-z]+/);
  if (!baseMatch) return token;
  const base = replaceGreekWords(baseMatch[0]);
  const suffix = token.slice(baseMatch[0].length);
  const scriptPattern = /(_\{([^}]+)\}|_([A-Za-z0-9+\-*/=()]+)|\^\{([^}]+)\}|\^([A-Za-z0-9+\-*/=()]+))/g;
  const scripts: React.ReactNode[] = [];
  let match: RegExpExecArray | null;
  let scriptIndex = 0;
  while ((match = scriptPattern.exec(suffix)) !== null) {
    const isSub = match[0].startsWith("_");
    const content = replaceGreekWords((match[2] ?? match[3] ?? match[4] ?? match[5] ?? "").trim());
    if (!content) continue;
    scripts.push(
      isSub ? (
        <sub key={`${key}-sub-${scriptIndex}`} className="richTextSub">
          {content}
        </sub>
      ) : (
        <sup key={`${key}-sup-${scriptIndex}`} className="richTextSup">
          {content}
        </sup>
      ),
    );
    scriptIndex += 1;
  }
  return (
    <span key={key} className="richMathToken">
      <span>{base}</span>
      {scripts}
    </span>
  );
}

function renderFractionToken(token: string, key: string): React.ReactNode {
  const match = token.match(/^\s*([A-Za-z0-9.]+)\s*\/\s*([A-Za-z0-9.]+)\s*$/);
  if (!match) return token;
  return (
    <span key={key} className="richFraction" aria-label={`${match[1]} over ${match[2]}`}>
      <span className="richFractionNumerator">{replaceGreekWords(match[1])}</span>
      <span className="richFractionBar" aria-hidden="true" />
      <span className="richFractionDenominator">{replaceGreekWords(match[2])}</span>
    </span>
  );
}

function renderMathishText(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MATHISH_TOKEN_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    if (token.includes("_") || token.includes("^")) {
      nodes.push(renderScriptedToken(token, `${keyPrefix}-script-${index}`));
    } else if (token.includes("/")) {
      nodes.push(renderFractionToken(token, `${keyPrefix}-fraction-${index}`));
    } else {
      nodes.push(
        <span key={`${keyPrefix}-greek-${index}`} className="richMathToken">
          {replaceGreekWords(token)}
        </span>,
      );
    }

    cursor = index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function renderDisplayText(value: string): React.ReactNode {
  const normalized = preprocessLatex(sanitizeDisplayText(value) || value);
  const lines = normalized.split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return (
              <strong key={`part-${lineIndex}-${partIndex}`} className="chatEmphasis">
                {renderMathishText(part.slice(2, -2), `strong-${lineIndex}-${partIndex}`)}
              </strong>
            );
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return (
              <strong key={`part-${lineIndex}-${partIndex}`} className="chatEmphasis">
                {renderMathishText(part.slice(1, -1), `em-${lineIndex}-${partIndex}`)}
              </strong>
            );
          }
          return <React.Fragment key={`part-${lineIndex}-${partIndex}`}>{renderMathishText(part, `plain-${lineIndex}-${partIndex}`)}</React.Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
}

export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const trimmed = raw.trim();
    const candidate =
      /^https?:\/\//i.test(trimmed) || /^[a-z][a-z0-9+\-.]*:/i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    const parsed = new URL(candidate);
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
