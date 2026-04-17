export type FloatingWindowPosition = {
  x: number;
  y: number;
};

export type FloatingWindowDragTarget = "dock" | "workspace" | "chat";

export type FloatingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const LIGHT_DESKTOP_LAYOUT_STORAGE_KEY = "knowledge_graph_light_desktop_layout_v1";

const FLOATING_WINDOW_COLLISION_MARGIN = 18;

export type StoredLightDesktopLayout = {
  dock: FloatingWindowPosition;
  workspace: FloatingWindowPosition;
  chat: FloatingWindowPosition;
};

export function makeFloatingRect(
  position: FloatingWindowPosition,
  size: { width: number; height: number },
): FloatingRect {
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };
}

export function toFloatingRect(shellRect: DOMRect, rect: DOMRect): FloatingRect {
  return {
    x: rect.left - shellRect.left,
    y: rect.top - shellRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function floatingRectsOverlap(a: FloatingRect, b: FloatingRect, margin = FLOATING_WINDOW_COLLISION_MARGIN): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    a.x >= b.x + b.width + margin ||
    a.y + a.height + margin <= b.y ||
    a.y >= b.y + b.height + margin
  );
}

export function clampFloatingPosition(
  target: FloatingWindowDragTarget,
  position: FloatingWindowPosition,
  size: { width: number; height: number },
  shellRect: DOMRect,
): FloatingWindowPosition {
  return {
    x: Math.max(target === "dock" ? 6 : 84, Math.min(shellRect.width - size.width - 10, position.x)),
    y: Math.max(10, Math.min(shellRect.height - size.height - 10, position.y)),
  };
}

export function resolveFloatingCollision(
  target: FloatingWindowDragTarget,
  position: FloatingWindowPosition,
  size: { width: number; height: number },
  shellRect: DOMRect,
  blockedRects: FloatingRect[],
): FloatingWindowPosition {
  let resolved = clampFloatingPosition(target, position, size, shellRect);
  const distanceFrom = (candidate: FloatingWindowPosition): number => Math.hypot(candidate.x - position.x, candidate.y - position.y);

  for (const blockedRect of blockedRects) {
    const currentRect = makeFloatingRect(resolved, size);
    if (!floatingRectsOverlap(currentRect, blockedRect)) continue;

    const candidates = [
      { x: blockedRect.x + blockedRect.width + FLOATING_WINDOW_COLLISION_MARGIN, y: resolved.y },
      { x: blockedRect.x - size.width - FLOATING_WINDOW_COLLISION_MARGIN, y: resolved.y },
      { x: resolved.x, y: blockedRect.y + blockedRect.height + FLOATING_WINDOW_COLLISION_MARGIN },
      { x: resolved.x, y: blockedRect.y - size.height - FLOATING_WINDOW_COLLISION_MARGIN },
    ]
      .map((candidate) => clampFloatingPosition(target, candidate, size, shellRect))
      .filter((candidate) => {
        const candidateRect = makeFloatingRect(candidate, size);
        return blockedRects.every((otherRect) => !floatingRectsOverlap(candidateRect, otherRect));
      })
      .sort((left, right) => distanceFrom(left) - distanceFrom(right));

    if (candidates.length > 0) {
      resolved = candidates[0];
    }
  }

  return resolved;
}

function isValidFloatingWindowPosition(value: unknown): value is FloatingWindowPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FloatingWindowPosition>;
  return typeof candidate.x === "number" && Number.isFinite(candidate.x) && typeof candidate.y === "number" && Number.isFinite(candidate.y);
}

export function readStoredLightDesktopLayout(): StoredLightDesktopLayout | null {
  try {
    const raw = localStorage.getItem(LIGHT_DESKTOP_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLightDesktopLayout>;
    if (
      isValidFloatingWindowPosition(parsed.dock) &&
      isValidFloatingWindowPosition(parsed.workspace) &&
      isValidFloatingWindowPosition(parsed.chat)
    ) {
      return {
        dock: parsed.dock,
        workspace: parsed.workspace,
        chat: parsed.chat,
      };
    }
  } catch {
    // Ignore invalid stored layout values.
  }
  return null;
}

export function computeCanonicalLightDesktopLayout(
  shellRect: DOMRect,
  dockSize: { width: number; height: number },
  workspaceSize: { width: number; height: number },
  chatSize: { width: number; height: number },
): StoredLightDesktopLayout {
  const dock = clampFloatingPosition("dock", { x: 18, y: 82 }, dockSize, shellRect);
  const dockRect = makeFloatingRect(dock, dockSize);
  const workspace = resolveFloatingCollision(
    "workspace",
    { x: dock.x + dockSize.width + 18, y: 84 },
    workspaceSize,
    shellRect,
    [dockRect],
  );
  const chat = resolveFloatingCollision(
    "chat",
    { x: shellRect.width - chatSize.width - 24, y: 84 },
    chatSize,
    shellRect,
    [dockRect, makeFloatingRect(workspace, workspaceSize)],
  );
  return { dock, workspace, chat };
}
