import { describe, expect, it } from "vitest";

import { buildTopicAnchorPoint, screenToCanvasPoint, zoomViewportAroundClientPoint } from "./graphCanvasInteractions";

describe("graphCanvasInteractions", () => {
  it("translates screen coordinates into canvas world coordinates", () => {
    const point = screenToCanvasPoint({
      screenX: 400,
      screenY: 300,
      rect: { left: 100, top: 50, width: 600, height: 500 },
      zoom: 2,
      panOffset: { x: 10, y: -5 },
    });

    expect(point).toEqual({ x: 290, y: 255 });
  });

  it("builds a stable topic anchor in screen space", () => {
    const anchor = buildTopicAnchorPoint({
      rect: { width: 600, height: 400 },
      position: { x: 500, y: 260, vx: 0, vy: 0 },
      zoom: 1,
      panOffset: { x: 0, y: 0 },
    });

    expect(anchor).toEqual({ x: 500, y: 260, side: "left" });
  });

  it("keeps world position stable while zooming around a client point", () => {
    const zoomed = zoomViewportAroundClientPoint({
      nextZoom: 2,
      rect: { left: 100, top: 100, width: 600, height: 400 },
      clientX: 400,
      clientY: 300,
      currentZoom: 1,
      panOffset: { x: 0, y: 0 },
    });

    expect(zoomed.zoom).toBe(2);
    expect(zoomed.panOffset).toEqual({ x: 0, y: 0 });
  });
});
