import { clamp, type TopicAnchorPoint, type NodePosition } from "./graphCanvasCore";

export function screenToCanvasPoint(args: {
  screenX: number;
  screenY: number;
  rect: { left: number; top: number; width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
}): { x: number; y: number } {
  const { screenX, screenY, rect, zoom, panOffset } = args;
  const mouseX = screenX - rect.left;
  const mouseY = screenY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  return {
    x: (mouseX - centerX) / zoom + centerX - panOffset.x,
    y: (mouseY - centerY) / zoom + centerY - panOffset.y,
  };
}

export function buildTopicAnchorPoint(args: {
  rect: { width: number; height: number };
  position: NodePosition;
  zoom: number;
  panOffset: { x: number; y: number };
}): TopicAnchorPoint {
  const { rect, position, zoom, panOffset } = args;
  const x = (position.x + panOffset.x - rect.width / 2) * zoom + rect.width / 2;
  const y = (position.y + panOffset.y - rect.height / 2) * zoom + rect.height / 2;
  return { x, y, side: x > rect.width * 0.56 ? "left" : "right" };
}

export function zoomViewportAroundClientPoint(args: {
  nextZoom: number;
  rect: { left: number; top: number; width: number; height: number };
  clientX: number;
  clientY: number;
  currentZoom: number;
  panOffset: { x: number; y: number };
}): { zoom: number; panOffset: { x: number; y: number } } {
  const { nextZoom, rect, clientX, clientY, currentZoom, panOffset } = args;
  const resolvedZoom = clamp(nextZoom, 0.45, 2.2);
  if (!Number.isFinite(resolvedZoom) || Math.abs(resolvedZoom - currentZoom) < 0.0001) {
    return { zoom: currentZoom, panOffset };
  }
  const pointerX = clientX - rect.left;
  const pointerY = clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const worldX = (pointerX - centerX) / currentZoom + centerX - panOffset.x;
  const worldY = (pointerY - centerY) / currentZoom + centerY - panOffset.y;
  return {
    zoom: resolvedZoom,
    panOffset: {
      x: (pointerX - centerX) / resolvedZoom + centerX - worldX,
      y: (pointerY - centerY) / resolvedZoom + centerY - worldY,
    },
  };
}
