import React, { useEffect, useMemo, useRef } from "react";

import type { Edge, Topic, Zone } from "../lib/types";

type GraphNode = {
  id: string;
  title: string;
  state: Topic["state"];
  level: number;
};

type NodePosition = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type ManualNodePositions = Record<string, { x: number; y: number }>;

type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ZoneGeometry = {
  center: { x: number; y: number };
  spread: number;
  contour: Array<{ x: number; y: number }>;
};

const ZONE_REVEAL_STAGGER_FRAMES = 5;
const ZONE_REVEAL_DURATION_FRAMES = 24;
const ZONE_GEOMETRY_REFRESH_FRAMES = 160;

type NodeAnchor = {
  x: number;
  y: number;
  angle: number;
  primaryRootId: string;
  primaryBranchId: string;
};

export type TopicAnchorPoint = {
  x: number;
  y: number;
  side: "left" | "right";
};

export type GraphCanvasThemeMode = "dark" | "light";

const POSITION_CACHE_KEY = "knowledge_graph_pos_v21";
const positionCache = new Map<string, { x: number; y: number }>();

try {
  const saved = localStorage.getItem(POSITION_CACHE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved) as Record<string, { x: number; y: number }>;
    Object.entries(parsed).forEach(([id, pos]) => positionCache.set(id, pos));
  }
} catch {
  // Ignore corrupted cached positions.
}

function savePositionCache(): void {
  try {
    localStorage.setItem(POSITION_CACHE_KEY, JSON.stringify(Object.fromEntries(positionCache.entries())));
  } catch {
    // Ignore localStorage write failures.
  }
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbaString(rgb: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixRgb(
  left: { r: number; g: number; b: number },
  right: { r: number; g: number; b: number },
  ratio: number,
): { r: number; g: number; b: number } {
  const t = clamp(ratio, 0, 1);
  return {
    r: Math.round(left.r * (1 - t) + right.r * t),
    g: Math.round(left.g * (1 - t) + right.g * t),
    b: Math.round(left.b * (1 - t) + right.b * t),
  };
}

type GraphCanvasPalette = {
  gridStroke: string;
  edgeRgb: string;
  nodeBaseFill: string;
  nodeSelectedFill: string;
  nodePathFill: string;
  nodeStableFill: string;
  nodeLearningFill: string;
  nodeReviewFill: string;
  nodeDefaultFill: string;
  frontierRgb: string;
  reviewRingRgb: string;
  labelRgb: string;
  shadowSelected: string;
  shadowPath: string;
  shadowContext: string;
  zoneOpacityMultiplier: number;
  zoneOutlineAlpha: number;
  zoneOutlineWidth: number;
};

function graphCanvasPalette(themeMode: GraphCanvasThemeMode): GraphCanvasPalette {
  if (themeMode === "light") {
    return {
      gridStroke: "rgba(17,24,39,0.06)",
      edgeRgb: "17,24,39",
      nodeBaseFill: "rgba(250,249,246,0.98)",
      nodeSelectedFill: "rgba(56,67,84,0.88)",
      nodePathFill: "rgba(84,96,115,0.84)",
      nodeStableFill: "rgba(96,108,126,0.78)",
      nodeLearningFill: "rgba(123,134,149,0.7)",
      nodeReviewFill: "rgba(178,80,58,0.86)",
      nodeDefaultFill: "rgba(132,126,119,0.68)",
      frontierRgb: "176,134,24",
      reviewRingRgb: "214,82,60",
      labelRgb: "17,24,39",
      shadowSelected: "rgba(15,23,42,0.2)",
      shadowPath: "rgba(15,23,42,0.12)",
      shadowContext: "rgba(15,23,42,0.06)",
      zoneOpacityMultiplier: 0.02,
      zoneOutlineAlpha: 0.2,
      zoneOutlineWidth: 1.5,
    };
  }

  return {
    gridStroke: "rgba(255,255,255,0.025)",
    edgeRgb: "255,255,255",
    nodeBaseFill: "rgba(38,38,38,0.95)",
    nodeSelectedFill: "rgba(255,255,255,0.96)",
    nodePathFill: "rgba(255,255,255,0.86)",
    nodeStableFill: "rgba(255,255,255,0.76)",
    nodeLearningFill: "rgba(255,255,255,0.62)",
    nodeReviewFill: "rgba(190,190,190,0.82)",
    nodeDefaultFill: "rgba(120,120,120,0.76)",
    frontierRgb: "255,214,102",
    reviewRingRgb: "255,50,40",
    labelRgb: "255,255,255",
    shadowSelected: "rgba(255,255,255,0.35)",
    shadowPath: "rgba(255,255,255,0.16)",
    shadowContext: "rgba(255,255,255,0.07)",
    zoneOpacityMultiplier: 1,
    zoneOutlineAlpha: 0,
    zoneOutlineWidth: 0,
  };
}

function nodeFillColor(node: GraphNode, selected: boolean, onPath: boolean, palette: GraphCanvasPalette): string {
  if (selected) return palette.nodeSelectedFill;
  if (onPath) return palette.nodePathFill;
  if (node.state === "mastered" || node.state === "solid") return palette.nodeStableFill;
  if (node.state === "learning") return palette.nodeLearningFill;
  if (node.state === "needs_review" || node.state === "shaky") return palette.nodeReviewFill;
  return palette.nodeDefaultFill;
}

function nodeRadius(node: GraphNode, selected: boolean, onPath: boolean, isRoot: boolean): number {
  if (selected) return 8;
  if (onPath) return 7;
  if (isRoot) return 6;
  if (node.level <= 1) return 5.5;
  return 5;
}

function labelSpreadRadius(node: GraphNode): number {
  return 26 + Math.min(110, node.title.length * 3.4);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function intersectsAny(box: LabelBox, others: LabelBox[]): boolean {
  return others.some(
    (other) => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom),
  );
}

function labelCandidateOrder(): number[] {
  return [0, 4, 2, 3, 1, 5];
}

function withinBounds(box: LabelBox, width: number, height: number, margin = 8): boolean {
  return box.left >= margin && box.right <= width - margin && box.top >= margin && box.bottom <= height - margin;
}

function averageAngles(values: number[]): number {
  if (values.length === 0) return -Math.PI / 2;
  const x = values.reduce((sum, value) => sum + Math.cos(value), 0);
  const y = values.reduce((sum, value) => sum + Math.sin(value), 0);
  return Math.atan2(y, x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildZoneContour(points: NodePosition[], intensity: number): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];

  const center = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
  const basePadding = 42 + intensity * 10;

  if (points.length === 1) {
    const radius = 58 + intensity * 10;
    return Array.from({ length: 10 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
      return {
        x: points[0].x + Math.cos(angle) * radius,
        y: points[0].y + Math.sin(angle) * radius,
      };
    });
  }

  if (points.length === 2) {
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / distance;
    const uy = dy / distance;
    const px = -uy;
    const py = ux;
    const sidePadding = 44 + intensity * 10;
    const capPadding = 32 + intensity * 8;
    return [
      { x: first.x - ux * capPadding + px * sidePadding, y: first.y - uy * capPadding + py * sidePadding },
      { x: first.x - ux * capPadding - px * sidePadding, y: first.y - uy * capPadding - py * sidePadding },
      { x: second.x + ux * capPadding - px * sidePadding, y: second.y + uy * capPadding - py * sidePadding },
      { x: second.x + ux * capPadding + px * sidePadding, y: second.y + uy * capPadding + py * sidePadding },
    ];
  }

  const expanded = points
    .map((point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / distance;
      const ny = dy / distance;
      const padding = basePadding + clamp(distance * 0.18, 10, 28);
      return {
        x: point.x + nx * padding,
        y: point.y + ny * padding,
        angle: Math.atan2(dy, dx),
      };
    })
    .sort((a, b) => a.angle - b.angle);

  return expanded.map(({ x, y }) => ({ x, y }));
}

function primaryZoneIdForTopic(zones: Zone[], topicId: string | null): string | null {
  if (!topicId) return null;
  const matches = zones.filter((zone) => zone.topic_ids.includes(topicId));
  if (matches.length === 0) return null;
  matches.sort((left, right) => {
    const bySize = left.topic_ids.length - right.topic_ids.length;
    if (bySize !== 0) return bySize;
    return right.intensity - left.intensity;
  });
  return matches[0]?.id ?? null;
}

function highlightedZoneIdsForSelection(zones: Zone[], selectedTopicId: string | null, pathNodeIds: Set<string>): Set<string> {
  const ids = new Set<string>();
  const selectedZoneId = primaryZoneIdForTopic(zones, selectedTopicId);
  if (selectedZoneId) ids.add(selectedZoneId);
  for (const topicId of pathNodeIds) {
    const zoneId = primaryZoneIdForTopic(zones, topicId);
    if (zoneId) ids.add(zoneId);
  }
  return ids;
}

function zoneIdByTopicId(zones: Zone[]): Map<string, string> {
  const map = new Map<string, string>();
  const topicIds = new Set(zones.flatMap((zone) => zone.topic_ids));
  for (const topicId of topicIds) {
    const zoneId = primaryZoneIdForTopic(zones, topicId);
    if (zoneId) {
      map.set(topicId, zoneId);
    }
  }
  return map;
}

function cloneManualNodePositions(positions: ManualNodePositions): ManualNodePositions {
  return Object.fromEntries(
    Object.entries(positions).map(([topicId, point]) => [topicId, { x: point.x, y: point.y }]),
  );
}

function cacheEntryKey(namespace: string, nodeId: string): string {
  return `${namespace}::${nodeId}`;
}

function buildAnchorMap(nodes: GraphNode[], edges: Edge[], width: number, height: number): Map<string, NodeAnchor> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    parentsByChild.set(node.id, []);
    childrenByParent.set(node.id, []);
  }
  for (const edge of edges) {
    parentsByChild.set(edge.target_topic_id, [...(parentsByChild.get(edge.target_topic_id) ?? []), edge.source_topic_id]);
    childrenByParent.set(edge.source_topic_id, [...(childrenByParent.get(edge.source_topic_id) ?? []), edge.target_topic_id]);
  }

  const roots = nodes.filter((node) => (parentsByChild.get(node.id) ?? []).length === 0).sort((a, b) => a.title.localeCompare(b.title));
  const stableWidth = Math.max(width, 900);
  const stableHeight = Math.max(height, 600);
  const minDimension = Math.min(stableWidth, stableHeight);
  const maxLevel = Math.max(...nodes.map((n) => n.level), 1);
  const anchors = new Map<string, NodeAnchor>();
  const resolving = new Set<string>();
  const resolvedPrimaryRoots = new Map<string, string>();
  const rootAngles = new Map<string, number>();
  const rootCount = Math.max(roots.length, 1);
  const rootRingRadius = Math.max(22, Math.min(58, minDimension * 0.064));
  const fullSpread = Math.PI * 2;
  const branchAngles = new Map<string, number>();
  const resolvedPrimaryBranches = new Map<string, string>();

  roots.forEach((root, index) => {
    const seed = hashString(root.id);
    const jitter = (((seed >> 20) % 1000) / 1000 - 0.5) * 0.16;
    rootAngles.set(root.id, (-Math.PI / 2) + (index / rootCount) * fullSpread + jitter);
  });

  function resolvePrimaryRootId(nodeId: string): string {
    const cached = resolvedPrimaryRoots.get(nodeId);
    if (cached) return cached;
    const parents = (parentsByChild.get(nodeId) ?? []).filter((pid) => byId.has(pid));
    if (parents.length === 0) { resolvedPrimaryRoots.set(nodeId, nodeId); return nodeId; }
    const freq = new Map<string, number>();
    for (const pid of parents) { const rid = resolvePrimaryRootId(pid); freq.set(rid, (freq.get(rid) ?? 0) + 1); }
    const sorted = [...freq.entries()].sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0]));
    const resolved = sorted[0]?.[0] ?? parents[0];
    resolvedPrimaryRoots.set(nodeId, resolved);
    return resolved;
  }

  function resolvePrimaryBranchId(nodeId: string): string {
    const cached = resolvedPrimaryBranches.get(nodeId);
    if (cached) return cached;
    const parents = (parentsByChild.get(nodeId) ?? []).filter((pid) => byId.has(pid));
    if (parents.length === 0) { resolvedPrimaryBranches.set(nodeId, nodeId); return nodeId; }
    if (parents.find((pid) => (parentsByChild.get(pid) ?? []).length === 0)) {
      resolvedPrimaryBranches.set(nodeId, nodeId); return nodeId;
    }
    const freq = new Map<string, number>();
    for (const pid of parents) { const bid = resolvePrimaryBranchId(pid); freq.set(bid, (freq.get(bid) ?? 0) + 1); }
    const sorted = [...freq.entries()].sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0]));
    resolvedPrimaryBranches.set(nodeId, sorted[0]?.[0] ?? nodeId);
    return resolvedPrimaryBranches.get(nodeId)!;
  }

  for (const root of roots) {
    const kids = (childrenByParent.get(root.id) ?? []).filter((cid) => byId.has(cid))
      .sort((a, b) => (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b));
    const sectorW = rootCount === 1 ? Math.PI * 1.6 : Math.max(0.8, (fullSpread / rootCount) * 0.88);
    const rootAngle = rootAngles.get(root.id) ?? -Math.PI / 2;
    kids.forEach((cid, i) => {
      const off = kids.length === 1 ? 0 : ((i / (kids.length - 1)) - 0.5) * sectorW;
      branchAngles.set(cid, rootAngle + off);
    });
  }

  function resolveAnchor(nodeId: string): NodeAnchor {
    const cached = anchors.get(nodeId);
    if (cached) return cached;
    if (resolving.has(nodeId)) return { x: width / 2, y: height / 2, angle: -Math.PI / 2, primaryRootId: nodeId, primaryBranchId: nodeId };
    resolving.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) { const fb = { x: width / 2, y: height / 2, angle: -Math.PI / 2, primaryRootId: nodeId, primaryBranchId: nodeId }; anchors.set(nodeId, fb); resolving.delete(nodeId); return fb; }
    const seed = hashString(node.id);
    const parents = (parentsByChild.get(node.id) ?? []).filter((pid) => byId.has(pid));
    const primaryRootId = resolvePrimaryRootId(node.id);
    const primaryBranchId = resolvePrimaryBranchId(node.id);
    const usableRadius = Math.max(200, minDimension * 0.72 - rootRingRadius);
    const radialStep = usableRadius / Math.max(maxLevel + 0.35, 1);
    const baseRadius = node.level <= 0 ? rootRingRadius : rootRingRadius + node.level * radialStep;
    const radiusJitter = (((seed >> 12) % 1000) / 1000 - 0.5) * minDimension * 0.018;
    let angle: number;
    if (parents.length === 0) {
      angle = rootAngles.get(node.id) ?? -Math.PI / 2;
    } else {
      const pAnchors = parents.map((pid) => resolveAnchor(pid));
      const pAngle = averageAngles(pAnchors.map((a) => a.angle));
      const bAngle = branchAngles.get(primaryBranchId) ?? rootAngles.get(primaryRootId) ?? pAngle;
      const sibs = Array.from(new Set(parents.flatMap((pid) => childrenByParent.get(pid) ?? []))).sort((a, b) => (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b));
      const si = Math.max(0, sibs.indexOf(node.id));
      const spread = Math.max(0.15, 0.85 / Math.max(sibs.length, 1));
      const sibOff = (si - (sibs.length - 1) / 2) * spread;
      const bPull = normalizeAngle(bAngle - pAngle) * 0.68;
      const jit = (((seed >> 22) % 1000) / 1000 - 0.5) * 0.05;
      angle = node.level === 1 ? bAngle + sibOff + jit : pAngle + bPull + sibOff + jit;
    }
    const radius = Math.max(rootRingRadius, baseRadius + radiusJitter);
    const anchor = { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, angle, primaryRootId, primaryBranchId };
    anchors.set(node.id, anchor); resolving.delete(nodeId); return anchor;
  }

  for (const node of nodes) resolveAnchor(node.id);
  return anchors;
}



function GraphCanvasComponent({
  topics,
  edges,
  zones,
  selectedTopicId,
  rootIds,
  ancestorIds,
  pathNodeIds,
  pathEdgeIds,
  frontierEdgeIds,
  onSelectTopic,
  onSelectedTopicAnchorChange,
  initialZoom = 1,
  targetZoom,
  centerOnNodeId,
  staticLayout = false,
  graphCacheKey = "default",
  nodePositions,
  layoutEditMode = false,
  onNodePositionsChange,
  disableIdleAnimations = false,
  backgroundFill = "#000000",
  themeMode = "dark",
  disableGrid = false,
  cascadeStepFrames = 8,
  disablePhysics = false,
  viewportCenteredWheelZoom = false,
  curvedEdgeLinesEnabled = true,
}: {
  topics: Topic[];
  edges: Edge[];
  zones: Zone[];
  selectedTopicId: string | null;
  rootIds: Set<string>;
  ancestorIds: Set<string>;
  pathNodeIds: Set<string>;
  pathEdgeIds: Set<string>;
  frontierEdgeIds?: Set<string>;
  onSelectTopic: (topicId: string | null, anchor: TopicAnchorPoint | null) => void;
  onSelectedTopicAnchorChange: (anchor: TopicAnchorPoint | null) => void;
  initialZoom?: number;
  targetZoom?: number;
  centerOnNodeId?: string | null;
  staticLayout?: boolean;
  graphCacheKey?: string;
  nodePositions?: ManualNodePositions | null;
  layoutEditMode?: boolean;
  onNodePositionsChange?: (positions: ManualNodePositions) => void;
  disableIdleAnimations?: boolean;
  backgroundFill?: string | null;
  themeMode?: GraphCanvasThemeMode;
  disableGrid?: boolean;
  cascadeStepFrames?: number;
  disablePhysics?: boolean;
  viewportCenteredWheelZoom?: boolean;
  curvedEdgeLinesEnabled?: boolean;
}
): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Map<string, NodePosition>>(new Map());
  const litFrameRef = useRef<Map<string, number>>(new Map());
  const labelPlacementRef = useRef<Map<string, number>>(new Map());
  const graphSignatureRef = useRef<string>("");
  const structureActivityFrameRef = useRef<number>(0);
  const idleFrozenRef = useRef<boolean>(false);
  const idleSettleFramesRef = useRef<number>(0);
  const lastEmittedAnchorRef = useRef<{ x: number; y: number; side: string } | null>(null);
  const pendingResizeRef = useRef<boolean>(false);
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef<number>(initialZoom);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const draggedNodeRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const manualPositionsRef = useRef<ManualNodePositions | null>(null);
  const disableIdleAnimationsRef = useRef<boolean>(disableIdleAnimations);
  const disableGridRef = useRef<boolean>(disableGrid);
  const viewportCenteredWheelZoomRef = useRef<boolean>(viewportCenteredWheelZoom ?? false);
  const curvedEdgeLinesEnabledRef = useRef<boolean>(curvedEdgeLinesEnabled);
  const paletteRef = useRef<GraphCanvasPalette>(graphCanvasPalette(themeMode));
  const backgroundFillRef = useRef<string | null>(backgroundFill);
  const onSelectTopicRef = useRef(onSelectTopic);
  const onSelectedTopicAnchorChangeRef = useRef(onSelectedTopicAnchorChange);
  const onNodePositionsChangeRef = useRef(onNodePositionsChange);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchGestureRef = useRef<{ distance: number; centerX: number; centerY: number } | null>(null);
  const gestureConsumedRef = useRef<boolean>(false);
  const zoneGeometryRef = useRef<Map<string, ZoneGeometry>>(new Map());
  const zoneRevealStartFrameRef = useRef<number>(0);
  const themeModeRef = useRef<GraphCanvasThemeMode>(themeMode);
  const viewportSignatureRef = useRef<string>("");
  paletteRef.current = graphCanvasPalette(themeMode);
  themeModeRef.current = themeMode;
  curvedEdgeLinesEnabledRef.current = curvedEdgeLinesEnabled;

  // Smoothly animate zoom towards targetZoom
  useEffect(() => {
    if (targetZoom == null) return;
    if (staticLayout) {
      zoomRef.current = targetZoom;
      return;
    }
    let raf: number;
    const animate = () => {
      const diff = targetZoom - zoomRef.current;
      if (Math.abs(diff) < 0.005) {
        zoomRef.current = targetZoom;
        return;
      }
      zoomRef.current += diff * 0.04;
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [targetZoom]);

  useEffect(() => {
    idleSettleFramesRef.current = 0;
    idleFrozenRef.current = disableIdleAnimations;
    for (const position of nodesRef.current.values()) {
      position.vx = 0;
      position.vy = 0;
    }
  }, [disableIdleAnimations]);

  // Auto-pan to center on specified node, or reset to center when null
  useEffect(() => {
    if (staticLayout) {
      if (centerOnNodeId) {
        const pos = nodesRef.current.get(centerOnNodeId);
        const canvas = canvasRef.current;
        if (pos && canvas) {
          const w = canvas.width / (window.devicePixelRatio || 1);
          const h = canvas.height / (window.devicePixelRatio || 1);
          panOffsetRef.current = {
            x: w / 2 - pos.x,
            y: h / 2 - pos.y,
          };
        }
      } else {
        panOffsetRef.current = { x: 0, y: 0 };
      }
      return;
    }
    let raf: number;
    const animate = () => {
      let targetPanX: number, targetPanY: number;
      if (centerOnNodeId) {
        const pos = nodesRef.current.get(centerOnNodeId);
        if (!pos) { raf = requestAnimationFrame(animate); return; }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        targetPanX = w / 2 - pos.x;
        targetPanY = h / 2 - pos.y;
      } else {
        targetPanX = 0;
        targetPanY = 0;
      }
      const dx = targetPanX - panOffsetRef.current.x;
      const dy = targetPanY - panOffsetRef.current.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        panOffsetRef.current = { x: targetPanX, y: targetPanY };
        return;
      }
      panOffsetRef.current = {
        x: panOffsetRef.current.x + dx * 0.06,
        y: panOffsetRef.current.y + dy * 0.06,
      };
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [centerOnNodeId]);

  const nodes = useMemo<GraphNode[]>(
    () =>
      topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        state: topic.state,
        level: topic.level,
      })),
    [topics],
  );

  const nodesDataRef = useRef<GraphNode[]>(nodes);
  const edgesDataRef = useRef<Edge[]>(edges);
  const zonesDataRef = useRef<Zone[]>(zones);
  const selectedTopicIdRef = useRef<string | null>(selectedTopicId);
  const rootIdsRef = useRef<Set<string>>(rootIds);
  const ancestorIdsRef = useRef<Set<string>>(ancestorIds);
  const pathNodeIdsRef = useRef<Set<string>>(pathNodeIds);
  const pathEdgeIdsRef = useRef<Set<string>>(pathEdgeIds);
  const frontierEdgeIdsRef = useRef<Set<string>>(frontierEdgeIds ?? new Set<string>());
  const layoutEditModeRef = useRef<boolean>(layoutEditMode);
  nodesDataRef.current = nodes;
  edgesDataRef.current = edges;
  zonesDataRef.current = zones;
  selectedTopicIdRef.current = selectedTopicId;
  rootIdsRef.current = rootIds;
  ancestorIdsRef.current = ancestorIds;
  pathNodeIdsRef.current = pathNodeIds;
  pathEdgeIdsRef.current = pathEdgeIds;
  frontierEdgeIdsRef.current = frontierEdgeIds ?? new Set<string>();
  onSelectTopicRef.current = onSelectTopic;
  onSelectedTopicAnchorChangeRef.current = onSelectedTopicAnchorChange;
  onNodePositionsChangeRef.current = onNodePositionsChange;
  layoutEditModeRef.current = layoutEditMode;
  disableIdleAnimationsRef.current = disableIdleAnimations;
  disableGridRef.current = disableGrid;
  viewportCenteredWheelZoomRef.current = viewportCenteredWheelZoom ?? false;
  backgroundFillRef.current = backgroundFill;

  const cascadeStepFramesRef = useRef<number>(cascadeStepFrames);
  cascadeStepFramesRef.current = cascadeStepFrames;
  
  const disablePhysicsRef = useRef<boolean>(disablePhysics);
  disablePhysicsRef.current = disablePhysics;

  useEffect(() => {
    graphSignatureRef.current = "";
    lastEmittedAnchorRef.current = null;
    idleSettleFramesRef.current = 0;
    idleFrozenRef.current = disableIdleAnimations;
    draggedNodeRef.current = null;
    dragStartRef.current = null;
    isDraggingRef.current = false;
  }, [disableIdleAnimations, graphCacheKey]);

  useEffect(() => {
    if (staticLayout) return;
    if (nodePositions && Object.keys(nodePositions).length > 0) {
      manualPositionsRef.current = cloneManualNodePositions(nodePositions);
      return;
    }
    if (!layoutEditMode) {
      manualPositionsRef.current = null;
    }
  }, [layoutEditMode, nodePositions, staticLayout]);

  useEffect(() => {
    const wrap = containerRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) return;
    const wrapEl = wrap;
    const canvasEl = canvas;
    const ctx2 = ctx;

    let raf = 0;
    let stopped = false;
    let frameCount = 0;
    let latestWidth = 0;
    let latestHeight = 0;

    function toScreenPoint(position: NodePosition): { x: number; y: number } {
      const zoom = zoomRef.current;
      return {
        x: (position.x + panOffsetRef.current.x - latestWidth / 2) * zoom + latestWidth / 2,
        y: (position.y + panOffsetRef.current.y - latestHeight / 2) * zoom + latestHeight / 2,
      };
    }

    function buildSelectedAnchor(topicId: string | null): TopicAnchorPoint | null {
      if (!topicId) return null;
      const position = nodesRef.current.get(topicId);
      if (!position) return null;
      const screen = toScreenPoint(position);
      return {
        x: screen.x,
        y: screen.y,
        side: screen.x > latestWidth * 0.56 ? "left" : "right",
      };
    }

    function emitSelectedAnchor(): void {
      const next = buildSelectedAnchor(selectedTopicIdRef.current);
      const prev = lastEmittedAnchorRef.current;
      if (next === null && prev === null) return;
      if (
        next !== null &&
        prev !== null &&
        Math.abs(next.x - prev.x) < 0.5 &&
        Math.abs(next.y - prev.y) < 0.5 &&
        next.side === prev.side
      ) {
        return;
      }
      lastEmittedAnchorRef.current = next;
      onSelectedTopicAnchorChangeRef.current(next);
    }

    // Apply resize inside tick() so resize and redraw stay in one frame.
    function handleResize(): void {
      const rect = wrapEl.getBoundingClientRect();
      latestWidth = rect.width;
      latestHeight = rect.height;
      pendingResizeRef.current = true;
    }

    function handleVisibilityRestore(): void {
      if (document.visibilityState === "hidden") return;
      handleResize();
      idleSettleFramesRef.current = 0;
      idleFrozenRef.current = disableIdleAnimationsRef.current;
      lastEmittedAnchorRef.current = null;
    }

    function applyPendingResize(): void {
      if (!pendingResizeRef.current) return;
      pendingResizeRef.current = false;
      const dpr = window.devicePixelRatio || 1;
      const nextW = Math.max(1, Math.floor(latestWidth * dpr));
      const nextH = Math.max(1, Math.floor(latestHeight * dpr));
      const viewportSignature = `${Math.round(latestWidth)}x${Math.round(latestHeight)}@${Math.round(dpr * 100)}`;
      const viewportChanged = viewportSignatureRef.current !== viewportSignature;
      if (canvasEl.width !== nextW || canvasEl.height !== nextH) {
        canvasEl.width = nextW;
        canvasEl.height = nextH;
        canvasEl.style.width = `${latestWidth}px`;
        canvasEl.style.height = `${latestHeight}px`;
        ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (viewportChanged) {
        viewportSignatureRef.current = viewportSignature;
        structureActivityFrameRef.current = frameCount;
        idleFrozenRef.current = false;
        idleSettleFramesRef.current = 0;
        lastEmittedAnchorRef.current = null;
        labelPlacementRef.current.clear();
        zoneGeometryRef.current.clear();
        zoneRevealStartFrameRef.current = frameCount + (staticLayout ? 4 : Math.max(8, cascadeStepFramesRef.current));
        const hasManualLayout = Boolean(manualPositionsRef.current && Object.keys(manualPositionsRef.current).length > 0);
        if (!staticLayout && !layoutEditModeRef.current && !hasManualLayout) {
          for (const node of nodesDataRef.current) {
            nodesRef.current.delete(node.id);
            positionCache.delete(cacheEntryKey(graphCacheKey, node.id));
          }
        }
        if (!staticLayout) {
          scheduleCascade();
        } else {
          litFrameRef.current.clear();
          for (const node of nodesDataRef.current) {
            litFrameRef.current.set(node.id, frameCount);
          }
          for (const edge of edgesDataRef.current) {
            litFrameRef.current.set(`e:${edge.id}`, frameCount);
          }
        }
      }
    }

    const ro = new ResizeObserver(() => handleResize());
    ro.observe(wrapEl);
    document.addEventListener("visibilitychange", handleVisibilityRestore);
    window.addEventListener("focus", handleVisibilityRestore);
    window.addEventListener("pageshow", handleVisibilityRestore);
    // Seed the initial size. tick() performs the actual canvas write.
    {
      const rect = wrapEl.getBoundingClientRect();
      latestWidth = rect.width;
      latestHeight = rect.height;
      pendingResizeRef.current = true;
    }

    function syncNodes(): void {
      const width = latestWidth;
      const height = latestHeight;
      if (width < 50 || height < 50) return;
      const anchors = buildAnchorMap(nodesDataRef.current, edgesDataRef.current, width, height);
      const manualPositions = manualPositionsRef.current;

      for (const node of nodesDataRef.current) {
        if (!nodesRef.current.has(node.id)) {
          const savedManualPosition = manualPositions?.[node.id];
          if (savedManualPosition) {
            nodesRef.current.set(node.id, { x: savedManualPosition.x, y: savedManualPosition.y, vx: 0, vy: 0 });
            continue;
          }
          const cached = positionCache.get(cacheEntryKey(graphCacheKey, node.id));
          if (cached) {
            nodesRef.current.set(node.id, { x: cached.x, y: cached.y, vx: 0, vy: 0 });
            continue;
          }
          const pos = anchors.get(node.id) ?? { x: width / 2, y: height / 2 };
          nodesRef.current.set(node.id, { x: pos.x, y: pos.y, vx: 0, vy: 0 });
        }
      }

      for (const id of Array.from(nodesRef.current.keys())) {
        if (!nodesDataRef.current.find((node) => node.id === id)) {
          nodesRef.current.delete(id);
          positionCache.delete(cacheEntryKey(graphCacheKey, id));
        }
      }
    }

    function scheduleCascade(): void {
      const currentNodes = nodesDataRef.current;
      const currentEdges = edgesDataRef.current;
      const byId = new Map(currentNodes.map((node) => [node.id, node]));
      const outgoing = new Map<string, Edge[]>();
      const indegree = new Map<string, number>();

      litFrameRef.current.clear();

      for (const node of currentNodes) {
        outgoing.set(node.id, []);
        indegree.set(node.id, 0);
      }
      for (const edge of currentEdges) {
        if (!byId.has(edge.source_topic_id) || !byId.has(edge.target_topic_id)) continue;
        outgoing.get(edge.source_topic_id)?.push(edge);
        indegree.set(edge.target_topic_id, (indegree.get(edge.target_topic_id) ?? 0) + 1);
      }

      const roots = currentNodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).sort((left, right) => left.title.localeCompare(right.title));
      const queue = roots.map((node) => ({ id: node.id, depth: 0 }));
      const visited = new Set(queue.map((item) => item.id));
      const stepFrames = cascadeStepFramesRef.current;

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        const nodeFrame = frameCount + current.depth * 2 * stepFrames;
        const existingNodeFrame = litFrameRef.current.get(current.id);
        if (existingNodeFrame === undefined || nodeFrame < existingNodeFrame) {
          litFrameRef.current.set(current.id, nodeFrame);
        }

        for (const edge of outgoing.get(current.id) ?? []) {
          const edgeKey = `e:${edge.id}`;
          const edgeFrame = frameCount + (current.depth * 2 + 1) * stepFrames;
          const existingEdgeFrame = litFrameRef.current.get(edgeKey);
          if (existingEdgeFrame === undefined || edgeFrame < existingEdgeFrame) {
            litFrameRef.current.set(edgeKey, edgeFrame);
          }
          if (!visited.has(edge.target_topic_id)) {
            visited.add(edge.target_topic_id);
            queue.push({ id: edge.target_topic_id, depth: current.depth + 1 });
          }
        }
      }

      for (const node of currentNodes) {
        if (!litFrameRef.current.has(node.id)) litFrameRef.current.set(node.id, frameCount);
      }
      for (const edge of currentEdges) {
        const edgeKey = `e:${edge.id}`;
        if (!litFrameRef.current.has(edgeKey)) litFrameRef.current.set(edgeKey, frameCount + stepFrames);
      }
    }

    function drawZoneBackgrounds(width: number, height: number, anchors: Map<string, NodeAnchor>): void {
      const positions = nodesRef.current;
      const structureAnimatingZones =
        !staticLayout &&
        !idleFrozenRef.current &&
        frameCount - structureActivityFrameRef.current <= ZONE_GEOMETRY_REFRESH_FRAMES;
      const shouldRefreshZoneGeometry =
        layoutEditModeRef.current ||
        draggedNodeRef.current !== null ||
        structureAnimatingZones ||
        zoneGeometryRef.current.size === 0;
      for (const [zoneIndex, zone] of zonesDataRef.current.entries()) {
        let geometry = zoneGeometryRef.current.get(zone.id);
        if (shouldRefreshZoneGeometry || !geometry) {
          const zonePoints = zone.topic_ids
            .map((topicId) => positions.get(topicId))
            .filter((point): point is NodePosition => Boolean(point));
          if (zonePoints.length === 0) continue;
          const center = zonePoints.reduce(
            (acc, point) => ({ x: acc.x + point.x / zonePoints.length, y: acc.y + point.y / zonePoints.length }),
            { x: 0, y: 0 },
          );
          geometry = {
            center,
            spread: Math.max(...zonePoints.map((point) => Math.hypot(point.x - center.x, point.y - center.y)), 44) + 86 + zone.intensity * 16,
            contour: buildZoneContour(zonePoints, zone.intensity),
          };
          zoneGeometryRef.current.set(zone.id, geometry);
        }
        if (!geometry) continue;
        const { center, spread, contour } = geometry;
        const rgb = hexToRgb(zone.color) ?? { r: 255, g: 214, b: 10 };
        const zoneRevealAge = frameCount - zoneRevealStartFrameRef.current - zoneIndex * ZONE_REVEAL_STAGGER_FRAMES;
        const zoneRevealProgress = clamp(zoneRevealAge / ZONE_REVEAL_DURATION_FRAMES, 0, 1);
        const easedZoneReveal = 1 - Math.pow(1 - zoneRevealProgress, 2);
        if (easedZoneReveal <= 0.001) continue;
        const zoneOpacityMultiplier = paletteRef.current.zoneOpacityMultiplier;
        const gradientProgress = easedZoneReveal;
        const gradientFill = ctx2.createRadialGradient(center.x, center.y, 0, center.x, center.y, spread);
        gradientFill.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.09 * zoneOpacityMultiplier * gradientProgress})`);
        gradientFill.addColorStop(0.48, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.045 * zoneOpacityMultiplier * gradientProgress})`);
        gradientFill.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx2.fillStyle = gradientFill;
        ctx2.beginPath();
        ctx2.arc(center.x, center.y, spread, 0, Math.PI * 2);
        ctx2.fill();
        if (paletteRef.current.zoneOutlineAlpha > 0 && contour.length >= 2) {
          ctx2.save();
          ctx2.setLineDash([10, 8]);
          ctx2.lineWidth = paletteRef.current.zoneOutlineWidth;
          ctx2.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${paletteRef.current.zoneOutlineAlpha * easedZoneReveal})`;
          ctx2.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${paletteRef.current.zoneOutlineAlpha * 0.14 * easedZoneReveal})`;
          ctx2.beginPath();
          ctx2.moveTo(contour[0].x, contour[0].y);
          for (let index = 1; index < contour.length; index += 1) {
            const point = contour[index];
            ctx2.lineTo(point.x, point.y);
          }
          ctx2.closePath();
          ctx2.fill();
          ctx2.stroke();
          ctx2.restore();
        }
      }

      const zoom = zoomRef.current;
      const worldLeft = (0 - width / 2) / zoom + width / 2 - panOffsetRef.current.x;
      const worldRight = (width - width / 2) / zoom + width / 2 - panOffsetRef.current.x;
      const worldTop = (0 - height / 2) / zoom + height / 2 - panOffsetRef.current.y;
      const worldBottom = (height - height / 2) / zoom + height / 2 - panOffsetRef.current.y;
      const gridStep = 40;
      const gridLeft = Math.floor(worldLeft / gridStep) * gridStep;
      const gridRight = Math.ceil(worldRight / gridStep) * gridStep;
      const gridTop = Math.floor(worldTop / gridStep) * gridStep;
      const gridBottom = Math.ceil(worldBottom / gridStep) * gridStep;

      if (!disableGridRef.current) {
        ctx2.strokeStyle = paletteRef.current.gridStroke;
        ctx2.lineWidth = 1;
        for (let x = gridLeft; x <= gridRight; x += gridStep) {
          if (x <= worldLeft + 1 || x >= worldRight - 1) continue;
          ctx2.beginPath();
          ctx2.moveTo(x, gridTop);
          ctx2.lineTo(x, gridBottom);
          ctx2.stroke();
        }
        for (let y = gridTop; y <= gridBottom; y += gridStep) {
          if (y <= worldTop + 1 || y >= worldBottom - 1) continue;
          ctx2.beginPath();
          ctx2.moveTo(gridLeft, y);
          ctx2.lineTo(gridRight, y);
          ctx2.stroke();
        }
      }
    }

    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      const zoomSpeed = 0.001;
      const minZoom = 0.45;
      const maxZoom = 2.2;
      const oldZoom = zoomRef.current;
      let newZoom = oldZoom * (1 - event.deltaY * zoomSpeed);
      newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      const rect = wrapEl.getBoundingClientRect();
      const targetClientX = viewportCenteredWheelZoomRef.current ? rect.left + rect.width / 2 : event.clientX;
      const targetClientY = viewportCenteredWheelZoomRef.current ? rect.top + rect.height / 2 : event.clientY;
      applyZoomAtClientPoint(newZoom, targetClientX, targetClientY);
      emitSelectedAnchor();
    };

    canvasEl.addEventListener("wheel", wheelHandler, { passive: false });

    function tick(): void {
      if (stopped) return;
      applyPendingResize();
      syncNodes();
      frameCount += 1;

      const width = latestWidth;
      const height = latestHeight;
      const currentNodes = nodesDataRef.current;
      const currentEdges = edgesDataRef.current;
      const positions = nodesRef.current;
      const anchors = buildAnchorMap(currentNodes, currentEdges, width, height);
      const zoneSignature = zonesDataRef.current
        .map((zone) => `${zone.id}:${zone.color}:${zone.intensity}:${[...zone.topic_ids].sort().join(",")}`)
        .sort()
        .join("|");
      const graphSignature = `${graphCacheKey}::${currentNodes.map((node) => node.id).sort().join("|")}::${currentEdges
        .map((edge) => edge.id)
        .sort()
        .join("|")}::${zoneSignature}`;

      if (graphSignatureRef.current !== graphSignature) {
        graphSignatureRef.current = graphSignature;
        structureActivityFrameRef.current = frameCount;
        zoneRevealStartFrameRef.current = frameCount + (staticLayout ? 6 : Math.max(12, cascadeStepFramesRef.current * 2));
        idleFrozenRef.current = false;
        idleSettleFramesRef.current = 0;
        labelPlacementRef.current.clear();
        zoneGeometryRef.current.clear();
        if (!staticLayout) {
          scheduleCascade();
        } else {
          litFrameRef.current.clear();
          for (const node of currentNodes) {
            litFrameRef.current.set(node.id, frameCount);
          }
          for (const edge of currentEdges) {
            litFrameRef.current.set(`e:${edge.id}`, frameCount);
          }
        }
      }

      if (staticLayout) {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const node of currentNodes) {
          const position = positions.get(node.id);
          const stable = anchors.get(node.id);
          if (!position || !stable) continue;
          position.x = stable.x;
          position.y = stable.y;
          position.vx = 0;
          position.vy = 0;
          const labelRadius = labelSpreadRadius(node);
          const horizontalPad = Math.max(52, Math.min(168, labelRadius * 1.06));
          const verticalPad = Math.max(38, Math.min(88, labelRadius * 0.48));
          minX = Math.min(minX, position.x - horizontalPad);
          maxX = Math.max(maxX, position.x + horizontalPad);
          minY = Math.min(minY, position.y - verticalPad);
          maxY = Math.max(maxY, position.y + verticalPad);
        }

        if (currentNodes.length > 0 && Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
          const boundsWidth = Math.max(120, maxX - minX);
          const boundsHeight = Math.max(120, maxY - minY);
          const framePaddingX = Math.max(18, width * 0.045);
          const framePaddingY = Math.max(18, height * 0.08);
          const fitZoom = Math.min(
            (width - framePaddingX * 2) / boundsWidth,
            (height - framePaddingY * 2) / boundsHeight,
          );
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;

          zoomRef.current = clamp(fitZoom, 0.22, 1.4);
          panOffsetRef.current = {
            x: width / 2 - centerX,
            y: height / 2 - centerY,
          };
        }
      } else {
        const pinnedPositions = manualPositionsRef.current ?? {};
        const draggedNodeId = draggedNodeRef.current?.nodeId ?? null;
        const idleAnimationsDisabled = disableIdleAnimationsRef.current;
        const currentMaxVelocity = Math.max(
          0,
          ...Array.from(positions.values()).map((position) => Math.max(Math.abs(position.vx), Math.abs(position.vy))),
        );
        if (!idleAnimationsDisabled || layoutEditModeRef.current || draggedNodeId) {
          idleFrozenRef.current = false;
          idleSettleFramesRef.current = 0;
        } else {
          const settleWindowReached = frameCount - structureActivityFrameRef.current > 90;
          if (!settleWindowReached) {
            idleFrozenRef.current = false;
            idleSettleFramesRef.current = 0;
          } else if (idleFrozenRef.current) {
            // Keep the scene fully still until the graph structure changes again.
            idleSettleFramesRef.current = 0;
          } else if (currentMaxVelocity < 0.35 || frameCount - structureActivityFrameRef.current > 180) {
            idleSettleFramesRef.current += 1;
            if (idleSettleFramesRef.current >= 4) {
              idleFrozenRef.current = true;
            }
          } else {
            idleSettleFramesRef.current = 0;
          }
        }
        const shouldFreezeIdleMotion = idleFrozenRef.current;
        if (shouldFreezeIdleMotion) {
          for (const node of currentNodes) {
            const position = positions.get(node.id);
            if (!position) continue;
            position.vx = 0;
            position.vy = 0;
            positionCache.set(cacheEntryKey(graphCacheKey, node.id), { x: position.x, y: position.y });
          }
        } else {
        const repulsion = 8500;
        const spring = 0.0046;
        const centerPull = 0.00008;
        const levelPull = 0.004;
        const siblingFanStrength = 0.0015;
        // Smooth startup: forces ramp up gradually, constant high damping prevents bounce
        const startupProgress = Math.min(1, frameCount / 80);
        const startupEase = startupProgress * startupProgress; // quadratic ease-in
        const damping = idleAnimationsDisabled ? 0.76 : 0.91;
        const forceScale = 0.15 + 0.85 * startupEase; // forces ramp up gradually
        const driftTime = frameCount * 0.012;
        const velocityEpsilon = idleAnimationsDisabled ? 0.018 : 0.003;

        if (!disablePhysicsRef.current) {
          // Pre-compute zone membership for density-aware repulsion
          const nodeZoneId = new Map<string, string>();
        const zoneSizeById = new Map<string, number>();
        for (const z of zonesDataRef.current) {
          zoneSizeById.set(z.id, z.topic_ids.length);
          for (const tid of z.topic_ids) nodeZoneId.set(tid, z.id);
        }

        for (let i = 0; i < currentNodes.length; i += 1) {
          const aNode = currentNodes[i];
          const a = positions.get(aNode.id);
          if (!a) continue;
          const aPinned = pinnedPositions[aNode.id];
          if (aNode.id === draggedNodeId) {
            a.vx = 0;
            a.vy = 0;
            continue;
          }
          const aAnchor = anchors.get(aNode.id);

          for (let j = i + 1; j < currentNodes.length; j += 1) {
            const bNode = currentNodes[j];
            const b = positions.get(bNode.id);
            if (!b) continue;
            const bPinned = pinnedPositions[bNode.id];
            if (bNode.id === draggedNodeId) {
              b.vx = 0;
              b.vy = 0;
              continue;
            }
            if (aPinned && bPinned) continue;
            const bAnchor = anchors.get(bNode.id);
            const aZone = nodeZoneId.get(aNode.id);
            const bZone = nodeZoneId.get(bNode.id);
            const sameZone = aZone && bZone && aZone === bZone;
            const zoneSize = sameZone ? (zoneSizeById.get(aZone) ?? 1) : 1;
            const densityBoost = sameZone ? 1 + Math.sqrt(Math.max(0, zoneSize - 4)) * 0.4 : 1;
            const collisionMinDist = Math.max(160, (labelSpreadRadius(aNode) + labelSpreadRadius(bNode)) * 0.95) * densityBoost;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const rawD2 = dx * dx + dy * dy;
            const d2 = Math.max(rawD2, collisionMinDist * collisionMinDist);
            const dist = Math.sqrt(rawD2) || 1;
            const branchMultiplier = aAnchor?.primaryRootId !== bAnchor?.primaryRootId ? 1.2 : 1;
            const sameZoneBoost = sameZone && zoneSize > 6 ? 1 + (zoneSize - 6) * 0.08 : 1;
            const force = (repulsion * branchMultiplier * sameZoneBoost * forceScale) / d2;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (!aPinned) {
              a.vx += fx;
              a.vy += fy;
            }
            if (!bPinned) {
              b.vx -= fx;
              b.vy -= fy;
            }
          }
        }

        for (const edge of currentEdges) {
          const from = positions.get(edge.source_topic_id);
          const to = positions.get(edge.target_topic_id);
          if (!from || !to) continue;
          if (edge.source_topic_id === draggedNodeId || edge.target_topic_id === draggedNodeId) continue;
          const sourcePinned = pinnedPositions[edge.source_topic_id];
          const targetPinned = pinnedPositions[edge.target_topic_id];
          if (sourcePinned && targetPinned) continue;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sourceLevel = currentNodes.find((node) => node.id === edge.source_topic_id)?.level ?? 0;
          const targetLevel = currentNodes.find((node) => node.id === edge.target_topic_id)?.level ?? 0;
          const levelGap = Math.max(1, Math.abs(targetLevel - sourceLevel));
          const target = 260 + levelGap * 48;
          const sourceZone = zonesDataRef.current.find((z) => z.topic_ids.includes(edge.source_topic_id))?.id;
          const targetZone = zonesDataRef.current.find((z) => z.topic_ids.includes(edge.target_topic_id))?.id;
          const crossZone = sourceZone && targetZone && sourceZone !== targetZone;
          let restLength = target;
          let edgeScale = 1;
          if (crossZone) {
            const srcAnchor = anchors.get(edge.source_topic_id);
            const tgtAnchor = anchors.get(edge.target_topic_id);
            if (srcAnchor && tgtAnchor) {
              restLength = Math.max(target, Math.sqrt((srcAnchor.x - tgtAnchor.x) ** 2 + (srcAnchor.y - tgtAnchor.y) ** 2));
            }
            edgeScale = 0.35;
          }
          const k = spring * (dist - restLength) * edgeScale;
          const fx = (dx / dist) * k;
          const fy = (dy / dist) * k;
          if (!sourcePinned) {
            from.vx += fx;
            from.vy += fy;
          }
          if (!targetPinned) {
            to.vx -= fx;
            to.vy -= fy;
          }
        }

        const outgoingByParent = new Map<string, string[]>();
        for (const edge of currentEdges) {
          outgoingByParent.set(edge.source_topic_id, [...(outgoingByParent.get(edge.source_topic_id) ?? []), edge.target_topic_id]);
        }

        for (const [parentId, childIds] of outgoingByParent) {
          if (childIds.length < 2) continue;
          const parent = positions.get(parentId);
          if (!parent) continue;
          const orderedChildren = childIds
            .map((childId) => {
              const child = positions.get(childId);
              if (!child) return null;
              const stableAngle = anchors.get(childId)?.angle ?? Math.atan2(child.y - parent.y, child.x - parent.x);
              return { id: childId, child, stableAngle };
            })
            .filter((entry): entry is { id: string; child: NodePosition; stableAngle: number } => Boolean(entry))
            .sort((left, right) => left.stableAngle - right.stableAngle);
          if (orderedChildren.length < 2) continue;

          const centerAngle = averageAngles(orderedChildren.map((entry) => entry.stableAngle));
          const totalSpread = clamp(0.56 + (orderedChildren.length - 2) * 0.18, 0.56, 1.28);
          const stepAngle = orderedChildren.length === 1 ? 0 : totalSpread / (orderedChildren.length - 1);

          orderedChildren.forEach((entry, index) => {
            if (entry.id === draggedNodeId) {
              entry.child.vx = 0;
              entry.child.vy = 0;
              return;
            }
            if (pinnedPositions[entry.id]) return;

            const dx = entry.child.x - parent.x;
            const dy = entry.child.y - parent.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const currentAngle = Math.atan2(dy, dx);
            const targetAngle = centerAngle + (index - (orderedChildren.length - 1) / 2) * stepAngle;
            const angleDelta = normalizeAngle(targetAngle - currentAngle);
            const tangentialX = -dy / dist;
            const tangentialY = dx / dist;
            const angularForce = angleDelta * siblingFanStrength * forceScale * Math.min(dist, 260);

            entry.child.vx += tangentialX * angularForce;
            entry.child.vy += tangentialY * angularForce;
          });
        }

        const zoneData = zonesDataRef.current;
        if (zoneData.length > 1) {
          const zoneCentroids = new Map<string, { x: number; y: number; count: number }>();
          for (const zone of zoneData) {
            let sx = 0, sy = 0, count = 0;
            for (const tid of zone.topic_ids) {
              const p = positions.get(tid);
              if (p) { sx += p.x; sy += p.y; count++; }
            }
            if (count > 0) zoneCentroids.set(zone.id, { x: sx / count, y: sy / count, count });
          }
          const zoneIds = [...zoneCentroids.keys()];
          for (let i = 0; i < zoneIds.length; i++) {
            for (let j = i + 1; j < zoneIds.length; j++) {
              const ca = zoneCentroids.get(zoneIds[i])!;
              const cb = zoneCentroids.get(zoneIds[j])!;
              const dx = ca.x - cb.x;
              const dy = ca.y - cb.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const minZoneDist = 100 + Math.sqrt(ca.count + cb.count) * 40;
              const effectiveDist = Math.max(dist, 1);
              const zoneRepulsion = effectiveDist < minZoneDist ? 120000 / (effectiveDist * effectiveDist + 1) : 50000 / (effectiveDist * effectiveDist + 1);
              const fx = (dx / dist) * zoneRepulsion;
              const fy = (dy / dist) * zoneRepulsion;
              const za = zoneData.find((z) => z.id === zoneIds[i])!;
              const zb = zoneData.find((z) => z.id === zoneIds[j])!;
              for (const tid of za.topic_ids) {
                const p = positions.get(tid);
                if (p && !pinnedPositions[tid]) { p.vx += fx / ca.count; p.vy += fy / ca.count; }
              }
              for (const tid of zb.topic_ids) {
                const p = positions.get(tid);
                if (p && !pinnedPositions[tid]) { p.vx -= fx / cb.count; p.vy -= fy / cb.count; }
              }
            }
          }
          for (const zone of zoneData) {
            const c = zoneCentroids.get(zone.id);
            if (!c || c.count < 2) continue;
            const cohesionStrength = 0.012 / Math.max(1, Math.sqrt(c.count / 4));
            for (const tid of zone.topic_ids) {
              const p = positions.get(tid);
              if (!p || pinnedPositions[tid]) continue;
              p.vx += (c.x - p.x) * cohesionStrength;
              p.vy += (c.y - p.y) * cohesionStrength;
            }
          }
        }
        } // End disablePhysicsRef.current block

        for (const node of currentNodes) {
          const position = positions.get(node.id);
          if (!position) continue;
          if (node.id === draggedNodeId) {
            position.vx = 0;
            position.vy = 0;
            continue;
          }
          const pinned = pinnedPositions[node.id];
          const stable = anchors.get(node.id) ?? { x: width / 2, y: height / 2, angle: -Math.PI / 2, primaryRootId: node.id, primaryBranchId: node.id };
          const radialScale = currentNodes.length > 0 ? node.level / Math.max(...currentNodes.map((item) => item.level), 1) : 0;
          const seed = hashString(node.id);
          const phase = ((seed % 8192) / 8192) * Math.PI * 2;
          const litFrame = litFrameRef.current.get(node.id);
          const age = litFrame === undefined ? 0 : Math.max(0, frameCount - litFrame);
          const ramp = Math.min(1, age / 32);
          if (pinned) {
            position.x = pinned.x;
            position.y = pinned.y;
            position.vx = 0;
            position.vy = 0;
            continue;
          }
            position.vx += (stable.x - position.x) * levelPull;
            position.vy += (stable.y - position.y) * levelPull;
            position.vx += (width / 2 - position.x) * centerPull * (1 - radialScale * 0.4);
            position.vy += (height / 2 - position.y) * centerPull * (1 - radialScale * 0.4);
            if (!idleAnimationsDisabled) {
              position.vx += Math.sin(driftTime + phase) * 0.0055 * ramp;
              position.vy += Math.cos(driftTime * 0.76 + phase * 1.17) * 0.0055 * ramp;
            }
          }

        for (const node of currentNodes) {
          const position = positions.get(node.id);
          if (!position) continue;
          if (node.id === draggedNodeId) {
            position.vx = 0;
            position.vy = 0;
            positionCache.set(cacheEntryKey(graphCacheKey, node.id), { x: position.x, y: position.y });
            continue;
          }
          const pinned = pinnedPositions[node.id];
          const litFrame = litFrameRef.current.get(node.id);
          const spawnAge = litFrame === undefined ? 999 : Math.max(0, frameCount - litFrame);
          const spawnEase = Math.min(1, spawnAge / 60);
          const nodeDamping = pinned
            ? (idleAnimationsDisabled ? 0.46 : 0.58)
            : 0.55 + (damping - 0.55) * spawnEase;
          position.vx *= nodeDamping;
          position.vy *= nodeDamping;
          if (Math.abs(position.vx) < velocityEpsilon) position.vx = 0;
          if (Math.abs(position.vy) < velocityEpsilon) position.vy = 0;
          position.x += position.vx;
          position.y += position.vy;
          if (pinned) {
            position.x = pinned.x;
            position.y = pinned.y;
            position.vx = 0;
            position.vy = 0;
            positionCache.set(cacheEntryKey(graphCacheKey, node.id), { x: position.x, y: position.y });
            continue;
          }
          const softBound = Math.max(width, height) * 1.5;
          position.x = Math.max(-softBound, Math.min(softBound, position.x));
          position.y = Math.max(-softBound, Math.min(softBound, position.y));
          positionCache.set(cacheEntryKey(graphCacheKey, node.id), { x: position.x, y: position.y });
        }
        }
      }

      if (frameCount % 60 === 0) savePositionCache();

      if (backgroundFillRef.current) {
        ctx2.fillStyle = backgroundFillRef.current;
        ctx2.fillRect(0, 0, width, height);
      } else {
        ctx2.clearRect(0, 0, width, height);
      }

      ctx2.save();
      const zoom = zoomRef.current;
      ctx2.translate(width / 2, height / 2);
      ctx2.scale(zoom, zoom);
      ctx2.translate(-width / 2 + panOffsetRef.current.x, -height / 2 + panOffsetRef.current.y);
      const renderIdleFrozen = disableIdleAnimationsRef.current && idleFrozenRef.current;

      drawZoneBackgrounds(width, height, anchors);

      const selectedPrimaryZoneId = primaryZoneIdForTopic(zonesDataRef.current, selectedTopicIdRef.current);
      const selectedZoneIds = themeModeRef.current === "light"
        ? highlightedZoneIdsForSelection(zonesDataRef.current, selectedTopicIdRef.current, pathNodeIdsRef.current)
        : selectedPrimaryZoneId
          ? new Set([selectedPrimaryZoneId])
          : new Set<string>();
      const zoneByTopicId = zoneIdByTopicId(zonesDataRef.current);
      const zoneById = new Map(zonesDataRef.current.map((zone) => [zone.id, zone]));
      const bundleMetaByEdgeId = new Map<string, { angle: number; laneOffset: number; laneCount: number }>();

      const outgoingBySource = new Map<string, Array<{ edge: Edge; angle: number }>>();
      for (const edge of currentEdges) {
        const from = positions.get(edge.source_topic_id);
        const to = positions.get(edge.target_topic_id);
        if (!from || !to) continue;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        outgoingBySource.set(edge.source_topic_id, [...(outgoingBySource.get(edge.source_topic_id) ?? []), { edge, angle }]);
      }

      for (const [sourceId, entries] of outgoingBySource) {
        if (entries.length === 0) continue;
        entries.sort((left, right) => left.angle - right.angle);
        const sourceAnchorAngle = anchors.get(sourceId)?.angle ?? averageAngles(entries.map((entry) => entry.angle));
        const bundleAngle = averageAngles(entries.map((entry) => entry.angle));
        const resolvedAngle = Math.abs(normalizeAngle(bundleAngle - sourceAnchorAngle)) > 0.9 ? sourceAnchorAngle : bundleAngle;
        const laneSpacing = clamp(10 - entries.length * 0.6, 5, 10);
        entries.forEach((entry, index) => {
          bundleMetaByEdgeId.set(entry.edge.id, {
            angle: resolvedAngle,
            laneOffset: (index - (entries.length - 1) / 2) * laneSpacing,
            laneCount: entries.length,
          });
        });
      }

      for (const edge of currentEdges) {
        const from = positions.get(edge.source_topic_id);
        const to = positions.get(edge.target_topic_id);
        if (!from || !to) continue;
        const edgeKey = `e:${edge.id}`;
        const litFrame = litFrameRef.current.get(edgeKey);
        const fadeRate = Math.max(16, cascadeStepFramesRef.current * 1.5);
        const edgeBrightness = litFrame === undefined ? 0 : Math.min(1, Math.max(0, (frameCount - litFrame) / fadeRate));
        const onPath = pathEdgeIdsRef.current.has(edge.id);
        const onFrontier = frontierEdgeIdsRef.current.has(edge.id);
        const sourceZoneId = zoneByTopicId.get(edge.source_topic_id) ?? null;
        const targetZoneId = zoneByTopicId.get(edge.target_topic_id) ?? null;
        const highlightedSourceZone = sourceZoneId && selectedZoneIds.has(sourceZoneId) ? zoneById.get(sourceZoneId) ?? null : null;
        const highlightedTargetZone = targetZoneId && selectedZoneIds.has(targetZoneId) ? zoneById.get(targetZoneId) ?? null : null;
        const pulse = renderIdleFrozen ? 0.84 : 0.84 + Math.sin(frameCount * 0.03 + from.x * 0.008) * 0.05;
        const targetX = from.x + (to.x - from.x) * edgeBrightness;
        const targetY = from.y + (to.y - from.y) * edgeBrightness;
        const bundleMeta = bundleMetaByEdgeId.get(edge.id);
        const bundleAngle = bundleMeta?.angle ?? Math.atan2(targetY - from.y, targetX - from.x);
        const bundleDist = Math.max(16, Math.min(46, Math.hypot(targetX - from.x, targetY - from.y) * 0.24));
        const laneOffset = bundleMeta?.laneOffset ?? 0;
        const perpX = -Math.sin(bundleAngle);
        const perpY = Math.cos(bundleAngle);
        const startControlX = from.x + Math.cos(bundleAngle) * bundleDist + perpX * laneOffset;
        const startControlY = from.y + Math.sin(bundleAngle) * bundleDist + perpY * laneOffset;
        const targetAngle = Math.atan2(targetY - from.y, targetX - from.x);
        const endBundleDist = Math.max(10, Math.min(34, Math.hypot(targetX - from.x, targetY - from.y) * 0.18));
        const endControlX = targetX - Math.cos(targetAngle) * endBundleDist + perpX * laneOffset * 0.24;
        const endControlY = targetY - Math.sin(targetAngle) * endBundleDist + perpY * laneOffset * 0.24;

        ctx2.beginPath();
        ctx2.moveTo(from.x, from.y);
        if (curvedEdgeLinesEnabledRef.current) {
          ctx2.bezierCurveTo(startControlX, startControlY, endControlX, endControlY, targetX, targetY);
        } else {
          ctx2.lineTo(targetX, targetY);
        }
        if (onPath) {
          if (themeModeRef.current === "light" && (highlightedSourceZone || highlightedTargetZone)) {
            const startRgb = hexToRgb(highlightedSourceZone?.color ?? highlightedTargetZone?.color ?? "#64748b") ?? { r: 100, g: 116, b: 139 };
            const endRgb = hexToRgb(highlightedTargetZone?.color ?? highlightedSourceZone?.color ?? "#64748b") ?? { r: 100, g: 116, b: 139 };
            if (highlightedSourceZone && highlightedTargetZone && highlightedSourceZone.id !== highlightedTargetZone.id) {
              const gradient = ctx2.createLinearGradient(from.x, from.y, targetX, targetY);
              gradient.addColorStop(0, rgbaString(startRgb, Math.max(0.24, pulse * 0.7 * edgeBrightness)));
              gradient.addColorStop(1, rgbaString(endRgb, Math.max(0.24, pulse * 0.7 * edgeBrightness)));
              ctx2.strokeStyle = gradient;
            } else {
              const rgb = mixRgb(startRgb, { r: 100, g: 116, b: 139 }, 0.1);
              ctx2.strokeStyle = rgbaString(rgb, Math.max(0.22, pulse * 0.72 * edgeBrightness));
            }
          } else {
            ctx2.strokeStyle = `rgba(${paletteRef.current.edgeRgb},${Math.max(0.04, pulse * edgeBrightness)})`;
          }
          ctx2.lineWidth = 1.7;
        } else if (onFrontier) {
          ctx2.setLineDash([7, 9]);
          ctx2.strokeStyle = `rgba(${paletteRef.current.edgeRgb},${0.012 + 0.05 * edgeBrightness})`;
          ctx2.lineWidth = 1;
        } else {
          ctx2.strokeStyle = `rgba(${paletteRef.current.edgeRgb},${0.012 + 0.05 * edgeBrightness})`;
          ctx2.lineWidth = 1;
        }
        ctx2.stroke();
        if (onFrontier) {
          ctx2.setLineDash([]);
        }
      }

      for (const node of currentNodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const litFrame = litFrameRef.current.get(node.id);
        const fadeRate = Math.max(18, cascadeStepFramesRef.current * 1.5);
        const brightness = litFrame === undefined ? 0 : Math.min(1, Math.max(0, (frameCount - litFrame) / fadeRate));
        const selected = selectedTopicIdRef.current === node.id;
        const onPath = pathNodeIdsRef.current.has(node.id);
        const contextual = ancestorIdsRef.current.has(node.id);
        const isRoot = rootIdsRef.current.has(node.id);
        const nodeZoneId = zoneByTopicId.get(node.id) ?? null;
        const effectiveZoneId = selected && selectedPrimaryZoneId ? selectedPrimaryZoneId : nodeZoneId;
        const highlightedZone = (selected || onPath) && effectiveZoneId && selectedZoneIds.has(effectiveZoneId)
          ? zoneById.get(effectiveZoneId) ?? null
          : null;
        const highlightedZoneRgb = highlightedZone ? hexToRgb(highlightedZone.color) : null;
        const r = nodeRadius(node, selected, onPath, isRoot);
        const haloPulse = renderIdleFrozen ? 0.55 : 0.55 + Math.sin(frameCount * 0.04 + position.x * 0.008) * 0.07;
        const frontierSources = currentEdges
          .filter((edge) => frontierEdgeIdsRef.current.has(edge.id) && edge.target_topic_id === node.id)
          .map((edge) => positions.get(edge.source_topic_id))
          .filter((point): point is NodePosition => Boolean(point));

        if (brightness > 0.06 && (selected || onPath)) {
          if (themeModeRef.current === "light" && highlightedZoneRgb) {
            ctx2.strokeStyle = rgbaString(highlightedZoneRgb, selected ? Math.max(0.72, haloPulse * brightness) : Math.max(0.52, 0.62 * brightness));
          } else {
            ctx2.strokeStyle = selected
              ? `rgba(${paletteRef.current.edgeRgb},${haloPulse * brightness})`
              : `rgba(${paletteRef.current.edgeRgb},${0.24 * brightness})`;
          }
          ctx2.lineWidth = selected ? 1.35 : 1;
          ctx2.beginPath();
          ctx2.arc(position.x, position.y, r + (selected ? 8 : 6), 0, Math.PI * 2);
          ctx2.stroke();
        } else if (brightness > 0.06 && frontierSources.length > 0) {
          const averageSource = frontierSources.reduce(
            (acc, source) => ({ x: acc.x + source.x, y: acc.y + source.y }),
            { x: 0, y: 0 },
          );
          averageSource.x /= frontierSources.length;
          averageSource.y /= frontierSources.length;
          const angle = Math.atan2(averageSource.y - position.y, averageSource.x - position.x);
          ctx2.strokeStyle = `rgba(${paletteRef.current.frontierRgb},${0.52 * brightness})`;
          ctx2.lineWidth = 1.35;
          ctx2.beginPath();
          ctx2.arc(position.x, position.y, r + 4, angle - 0.54, angle + 0.54);
          ctx2.stroke();
        } else if (brightness > 0.06 && (node.state === "needs_review" || node.state === "shaky")) {
          ctx2.setLineDash([4, 6]);
          ctx2.shadowBlur = 12;
          ctx2.shadowColor = `rgba(${paletteRef.current.reviewRingRgb},0.6)`;
          ctx2.strokeStyle = `rgba(${paletteRef.current.reviewRingRgb},${0.7 * brightness})`;
          ctx2.lineWidth = 1.2;
          ctx2.beginPath();
          ctx2.arc(position.x, position.y, r + 8, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.setLineDash([]);
          ctx2.shadowBlur = 0;
        } else if (brightness > 0.06 && isRoot) {
          ctx2.setLineDash([4, 6]);
          ctx2.strokeStyle = `rgba(${paletteRef.current.edgeRgb},${0.14 * brightness})`;
          ctx2.lineWidth = 1;
          ctx2.beginPath();
          ctx2.arc(position.x, position.y, r + 8, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.setLineDash([]);
        } else if (brightness > 0.06 && themeModeRef.current === "light" && highlightedZoneRgb) {
          ctx2.strokeStyle = rgbaString(highlightedZoneRgb, selected ? 0.9 : onPath ? 0.72 : 0.52);
          ctx2.lineWidth = selected ? 1.8 : 1.35;
          ctx2.beginPath();
          ctx2.arc(position.x, position.y, r + 5, 0, Math.PI * 2);
          ctx2.stroke();
        }

        ctx2.fillStyle = paletteRef.current.nodeBaseFill;
        ctx2.beginPath();
        ctx2.arc(position.x, position.y, r, 0, Math.PI * 2);
        ctx2.fill();

        ctx2.globalAlpha = themeModeRef.current === "light" ? Math.max(0.34, brightness) : brightness;
        const isBlocker = node.state === "needs_review" || node.state === "shaky";
        ctx2.shadowBlur = selected ? 14 : onPath ? 8 : contextual ? 4 : 0;
        ctx2.shadowColor = selected
          ? paletteRef.current.shadowSelected
          : onPath
            ? paletteRef.current.shadowPath
            : paletteRef.current.shadowContext;
        if (themeModeRef.current === "light" && highlightedZoneRgb) {
          const zoneTint = selected ? 0.78 : onPath ? 0.62 : 0.46;
          ctx2.fillStyle = rgbaString(highlightedZoneRgb, zoneTint);
        } else {
          ctx2.fillStyle = nodeFillColor(node, selected, onPath, paletteRef.current);
        }
        ctx2.beginPath();
        ctx2.arc(position.x, position.y, r, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.globalAlpha = 1;
        ctx2.shadowBlur = 0;
      }

      const placedLabels: LabelBox[] = [];
      const labelNodes = [...currentNodes].sort((left, right) => {
        const leftScore = (selectedTopicIdRef.current === left.id ? 100 : 0) + (pathNodeIdsRef.current.has(left.id) ? 10 : 0) + (ancestorIdsRef.current.has(left.id) ? 1 : 0);
        const rightScore =
          (selectedTopicIdRef.current === right.id ? 100 : 0) + (pathNodeIdsRef.current.has(right.id) ? 10 : 0) + (ancestorIdsRef.current.has(right.id) ? 1 : 0);
        return rightScore - leftScore;
      });

      ctx2.save();
      ctx2.font = "10px 'Berkeley Mono', 'JetBrains Mono', monospace";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";

      for (const node of labelNodes) {
        const position = positions.get(node.id);
        const anchor = anchors.get(node.id);
        if (!position || !anchor) continue;
        const selected = selectedTopicIdRef.current === node.id;
        const onPath = pathNodeIdsRef.current.has(node.id);
        const contextual = ancestorIdsRef.current.has(node.id);
        const isRoot = rootIdsRef.current.has(node.id);
        const litFrame = litFrameRef.current.get(node.id);
        const fadeRate = Math.max(18, cascadeStepFramesRef.current * 1.5);
        const brightness = litFrame === undefined ? 0 : Math.min(1, Math.max(0, (frameCount - litFrame) / fadeRate));
        if (brightness < 0.1) continue;
        const radius = nodeRadius(node, selected, onPath, isRoot);
        const alpha = (selected ? 0.96 : onPath ? 0.76 : contextual ? 0.48 : 0.22) * brightness;
        const textWidth = ctx2.measureText(node.title).width;
        const candidates = [
          { x: position.x, y: position.y - radius - 12 },
          { x: position.x, y: position.y + radius + 12 },
          { x: position.x - radius - 10, y: position.y },
          { x: position.x + radius + 10, y: position.y },
          { x: position.x, y: position.y - radius - 24 },
          { x: position.x, y: position.y + radius + 24 },
        ];
        const cachedIndex = labelPlacementRef.current.get(node.id);
        const preferredOrder = labelCandidateOrder();
        // Try the cached label slot first to reduce placement oscillation.
        const order =
          cachedIndex === undefined
            ? preferredOrder
            : [cachedIndex, ...preferredOrder.filter((index) => index !== cachedIndex)];

        let chosenIndex = order[0] ?? 0;
        let chosen = candidates[chosenIndex];
        let chosenBox: LabelBox = {
          left: chosen.x - textWidth / 2 - 4,
          right: chosen.x + textWidth / 2 + 4,
          top: chosen.y - 8,
          bottom: chosen.y + 8,
        };

        for (const candidateIndex of order) {
          const candidate = candidates[candidateIndex];
          const nextBox: LabelBox = {
            left: candidate.x - textWidth / 2 - 4,
            right: candidate.x + textWidth / 2 + 4,
            top: candidate.y - 8,
            bottom: candidate.y + 8,
          };
          if (withinBounds(nextBox, width, height) && !intersectsAny(nextBox, placedLabels)) {
            chosenIndex = candidateIndex;
            chosen = candidate;
            chosenBox = nextBox;
            break;
          }
        }

        labelPlacementRef.current.set(node.id, chosenIndex);
        if (themeModeRef.current === "light" && (selected || onPath)) {
          chosen = { ...chosen, y: chosen.y - 2 };
          chosenBox = {
            left: chosenBox.left,
            right: chosenBox.right,
            top: chosenBox.top - 2,
            bottom: chosenBox.bottom - 2,
          };
        }
        placedLabels.push(chosenBox);
        const nodeZoneId = zoneByTopicId.get(node.id) ?? null;
        const effectiveZoneId = selected && selectedPrimaryZoneId ? selectedPrimaryZoneId : nodeZoneId;
        const highlightedZone = (selected || onPath) && effectiveZoneId && selectedZoneIds.has(effectiveZoneId)
          ? zoneById.get(effectiveZoneId) ?? null
          : null;
        const highlightedZoneRgb = highlightedZone ? hexToRgb(highlightedZone.color) : null;
        if (themeModeRef.current === "light" && highlightedZoneRgb && (selected || onPath)) {
          const labelBg = mixRgb(highlightedZoneRgb, { r: 255, g: 255, b: 255 }, 0.08);
          ctx2.fillStyle = rgbaString(labelBg, Math.min(0.96, 0.72 + alpha * 0.3));
          ctx2.beginPath();
          ctx2.roundRect(chosenBox.left - 4, chosenBox.top - 3, chosenBox.right - chosenBox.left + 8, chosenBox.bottom - chosenBox.top + 6, 8);
          ctx2.fill();
          ctx2.fillStyle = `rgba(255,255,255,${Math.min(0.98, 0.78 + alpha * 0.24)})`;
        } else {
          ctx2.fillStyle = `rgba(${paletteRef.current.labelRgb},${alpha})`;
        }
        ctx2.fillText(node.title, chosen.x, chosen.y);
      }

      ctx2.restore();

      for (const zone of zonesDataRef.current) {
        if (!selectedZoneIds.has(zone.id)) continue;
        const zonePoints = zone.topic_ids.map((topicId) => positions.get(topicId)).filter((point): point is NodePosition => Boolean(point));
        if (zonePoints.length === 0) continue;
        const center = zonePoints.reduce(
          (acc, point) => ({ x: acc.x + point.x / zonePoints.length, y: acc.y + point.y / zonePoints.length }),
          { x: 0, y: 0 },
        );
        const rgb = hexToRgb(zone.color) ?? { r: 255, g: 214, b: 10 };
        ctx2.save();
        ctx2.font = "12px 'Berkeley Mono', 'JetBrains Mono', monospace";
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`;
        ctx2.shadowBlur = 22;
        ctx2.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.24)`;
        ctx2.fillText(zone.title, center.x, center.y - 18);
        ctx2.restore();
      }

      ctx2.restore();
      // Throttle anchor updates while nodes are still settling.
      if (frameCount % 10 === 0) emitSelectedAnchor();
      raf = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityRestore);
      window.removeEventListener("focus", handleVisibilityRestore);
      window.removeEventListener("pageshow", handleVisibilityRestore);
      canvasEl.removeEventListener("wheel", wheelHandler);
    };
  }, []);

  function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const wrap = containerRef.current;
    if (!wrap) return { x: screenX, y: screenY };
    const rect = wrap.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const zoom = zoomRef.current;
    return {
      x: (mouseX - centerX) / zoom + centerX - panOffsetRef.current.x,
      y: (mouseY - centerY) / zoom + centerY - panOffsetRef.current.y,
    };
  }

  function buildTopicAnchor(topicId: string | null): TopicAnchorPoint | null {
    if (!topicId) return null;
    const rect = containerRef.current?.getBoundingClientRect();
    const position = nodesRef.current.get(topicId);
    if (!rect || !position) return null;
    const zoom = zoomRef.current;
    const x = (position.x + panOffsetRef.current.x - rect.width / 2) * zoom + rect.width / 2;
    const y = (position.y + panOffsetRef.current.y - rect.height / 2) * zoom + rect.height / 2;
    return { x, y, side: x > rect.width * 0.56 ? "left" : "right" };
  }

  function applyZoomAtClientPoint(nextZoom: number, clientX: number, clientY: number): void {
    const wrap = containerRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const oldZoom = zoomRef.current;
    const resolvedZoom = clamp(nextZoom, 0.45, 2.2);
    if (!Number.isFinite(resolvedZoom) || Math.abs(resolvedZoom - oldZoom) < 0.0001) return;
    zoomRef.current = resolvedZoom;
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (pointerX - centerX) / oldZoom + centerX - panOffsetRef.current.x;
    const worldY = (pointerY - centerY) / oldZoom + centerY - panOffsetRef.current.y;
    panOffsetRef.current.x = (pointerX - centerX) / resolvedZoom + centerX - worldX;
    panOffsetRef.current.y = (pointerY - centerY) / resolvedZoom + centerY - worldY;
  }

  function resetPointerGestureState(): void {
    activePointersRef.current.clear();
    pinchGestureRef.current = null;
    dragStartRef.current = null;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = layoutEditModeRef.current ? "crosshair" : "grab";
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (canvasRef.current) {
      canvasRef.current.setPointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      pinchGestureRef.current = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
      };
      draggedNodeRef.current = null;
      dragStartRef.current = null;
      isDraggingRef.current = false;
      gestureConsumedRef.current = true;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = "grabbing";
      }
      return;
    }

    gestureConsumedRef.current = false;
    if (layoutEditModeRef.current) {
      const { x: canvasX, y: canvasY } = screenToCanvas(event.clientX, event.clientY);
      let best: { id: string; d2: number } | null = null;
      for (const node of nodesDataRef.current) {
        const position = nodesRef.current.get(node.id);
        if (!position) continue;
        const dx = position.x - canvasX;
        const dy = position.y - canvasY;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) best = { id: node.id, d2 };
      }
      if (best && best.d2 < 28 * 28) {
        const position = nodesRef.current.get(best.id);
        if (position) {
          draggedNodeRef.current = {
            nodeId: best.id,
            offsetX: position.x - canvasX,
            offsetY: position.y - canvasY,
          };
          isDraggingRef.current = true;
          gestureConsumedRef.current = true;
          if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
          return;
        }
      }
    }
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: panOffsetRef.current.x,
      offsetY: panOffsetRef.current.y,
    };
    isDraggingRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      const pinch = pinchGestureRef.current ?? {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
      };
      const nextCenterX = (first.x + second.x) / 2;
      const nextCenterY = (first.y + second.y) / 2;
      const nextDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const zoomRatio = nextDistance / Math.max(1, pinch.distance);
      applyZoomAtClientPoint(zoomRef.current * zoomRatio, nextCenterX, nextCenterY);
      panOffsetRef.current = {
        x: panOffsetRef.current.x + (nextCenterX - pinch.centerX) / zoomRef.current,
        y: panOffsetRef.current.y + (nextCenterY - pinch.centerY) / zoomRef.current,
      };
      pinchGestureRef.current = {
        distance: nextDistance,
        centerX: nextCenterX,
        centerY: nextCenterY,
      };
      gestureConsumedRef.current = true;
      onSelectedTopicAnchorChangeRef.current(buildTopicAnchor(selectedTopicIdRef.current));
      return;
    }

    if (draggedNodeRef.current) {
      const { x: canvasX, y: canvasY } = screenToCanvas(event.clientX, event.clientY);
      const activeDrag = draggedNodeRef.current;
      const position = nodesRef.current.get(activeDrag.nodeId);
      if (!position) return;
      const nextX = canvasX + activeDrag.offsetX;
      const nextY = canvasY + activeDrag.offsetY;
      position.x = nextX;
      position.y = nextY;
      position.vx = 0;
      position.vy = 0;
      const nextManualPositions: ManualNodePositions = {
        ...(manualPositionsRef.current ?? {}),
        [activeDrag.nodeId]: { x: nextX, y: nextY },
      };
      manualPositionsRef.current = nextManualPositions;
      return;
    }
    if (!dragStartRef.current) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 5) isDraggingRef.current = true;
    if (isDraggingRef.current) {
      gestureConsumedRef.current = true;
      panOffsetRef.current = {
        x: dragStartRef.current.offsetX + dx,
        y: dragStartRef.current.offsetY + dy,
      };
      onSelectedTopicAnchorChangeRef.current(buildTopicAnchor(selectedTopicIdRef.current));
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    activePointersRef.current.delete(event.pointerId);
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      return;
    }

    if (pinchGestureRef.current) {
      const remainingPointer = Array.from(activePointersRef.current.values())[0];
      pinchGestureRef.current = null;
      if (remainingPointer) {
        dragStartRef.current = {
          x: remainingPointer.x,
          y: remainingPointer.y,
          offsetX: panOffsetRef.current.x,
          offsetY: panOffsetRef.current.y,
        };
      }
      isDraggingRef.current = false;
      gestureConsumedRef.current = true;
      return;
    }

    if (draggedNodeRef.current) {
      draggedNodeRef.current = null;
      isDraggingRef.current = false;
      if (manualPositionsRef.current) {
        onNodePositionsChangeRef.current?.(cloneManualNodePositions(manualPositionsRef.current));
      }
      if (canvasRef.current) canvasRef.current.style.cursor = layoutEditModeRef.current ? "crosshair" : "grab";
      gestureConsumedRef.current = true;
      return;
    }
    if (!gestureConsumedRef.current && !isDraggingRef.current && dragStartRef.current) {
      const { x: canvasX, y: canvasY } = screenToCanvas(event.clientX, event.clientY);
      let best: { id: string; d2: number } | null = null;
      for (const node of nodesDataRef.current) {
        const position = nodesRef.current.get(node.id);
        if (!position) continue;
        const dx = position.x - canvasX;
        const dy = position.y - canvasY;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) best = { id: node.id, d2 };
      }
      if (best && best.d2 < 25 * 25) {
        const rect = containerRef.current?.getBoundingClientRect();
        const position = nodesRef.current.get(best.id);
        if (rect && position) {
          const zoom = zoomRef.current;
          const x = (position.x + panOffsetRef.current.x - rect.width / 2) * zoom + rect.width / 2;
          const y = (position.y + panOffsetRef.current.y - rect.height / 2) * zoom + rect.height / 2;
          onSelectTopicRef.current(best.id, { x, y, side: x > rect.width * 0.56 ? "left" : "right" });
        } else {
          onSelectTopicRef.current(best.id, null);
        }
      } else {
        onSelectTopicRef.current(null, null);
      }
    }

    isDraggingRef.current = false;
    dragStartRef.current =
      activePointersRef.current.size === 1
        ? {
            x: Array.from(activePointersRef.current.values())[0].x,
            y: Array.from(activePointersRef.current.values())[0].y,
            offsetX: panOffsetRef.current.x,
            offsetY: panOffsetRef.current.y,
          }
        : null;
    if (activePointersRef.current.size === 0) {
      gestureConsumedRef.current = false;
    }
    if (canvasRef.current) canvasRef.current.style.cursor = layoutEditModeRef.current ? "crosshair" : "grab";
  }

  function onPointerCancel(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    resetPointerGestureState();
    draggedNodeRef.current = null;
    isDraggingRef.current = false;
    gestureConsumedRef.current = false;
  }

  return (
    <div ref={containerRef} className="neuroGraphSurface">
      <canvas
        ref={canvasRef}
        className="neuroGraphCanvas"
        style={{ cursor: layoutEditMode ? "crosshair" : "grab", touchAction: "none", background: backgroundFill ?? "transparent" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  );
}

GraphCanvasComponent.displayName = "GraphCanvas";

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export const GraphCanvas = React.memo(GraphCanvasComponent, (prev, next) => {
  if (prev.topics !== next.topics) return false;
  if (prev.edges !== next.edges) return false;
  if (prev.zones !== next.zones) return false;
  if (prev.selectedTopicId !== next.selectedTopicId) return false;
  if (prev.initialZoom !== next.initialZoom) return false;
  if (prev.targetZoom !== next.targetZoom) return false;
  if (prev.centerOnNodeId !== next.centerOnNodeId) return false;
  if (prev.staticLayout !== next.staticLayout) return false;
  if (prev.graphCacheKey !== next.graphCacheKey) return false;
  if (prev.layoutEditMode !== next.layoutEditMode) return false;
  if (prev.nodePositions !== next.nodePositions) return false;
  if (prev.disableIdleAnimations !== next.disableIdleAnimations) return false;
  if (prev.backgroundFill !== next.backgroundFill) return false;
  if (prev.themeMode !== next.themeMode) return false;
  if (prev.disableGrid !== next.disableGrid) return false;
  if (prev.disablePhysics !== next.disablePhysics) return false;
  if (prev.viewportCenteredWheelZoom !== next.viewportCenteredWheelZoom) return false;
  if (prev.curvedEdgeLinesEnabled !== next.curvedEdgeLinesEnabled) return false;
  if (!setsEqual(prev.rootIds, next.rootIds)) return false;
  if (!setsEqual(prev.ancestorIds, next.ancestorIds)) return false;
  if (!setsEqual(prev.pathNodeIds, next.pathNodeIds)) return false;
  if (!setsEqual(prev.pathEdgeIds, next.pathEdgeIds)) return false;
  if (!setsEqual(prev.frontierEdgeIds ?? new Set<string>(), next.frontierEdgeIds ?? new Set<string>())) return false;
  // Callback refs already absorb identity changes without re-rendering.
  return true;
});
