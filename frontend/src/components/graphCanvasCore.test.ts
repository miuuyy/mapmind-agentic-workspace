import { describe, expect, it } from "vitest";

import { buildAnchorMap, buildZoneContour } from "./graphCanvasCore";

describe("buildAnchorMap", () => {
  it("does not recurse forever on cyclic graphs", () => {
    const anchors = buildAnchorMap(
      [
        { id: "a", title: "A", state: "not_started", level: 0 },
        { id: "b", title: "B", state: "not_started", level: 1 },
      ],
      [
        { id: "e1", source_topic_id: "a", target_topic_id: "b", relation: "bridges", rationale: "" },
        { id: "e2", source_topic_id: "b", target_topic_id: "a", relation: "bridges", rationale: "" },
      ],
      1200,
      800,
    );

    expect(anchors.get("a")).toBeDefined();
    expect(anchors.get("b")).toBeDefined();
  });
});

function polygonContainsPoint(
  polygon: Array<{ x: number; y: number }>,
  point: { x: number; y: number },
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

describe("buildZoneContour", () => {
  it("keeps irregular expanded clusters inside the final contour", () => {
    const points = [
      { x: 120, y: 120, vx: 0, vy: 0 },
      { x: 280, y: 140, vx: 0, vy: 0 },
      { x: 190, y: 230, vx: 0, vy: 0 },
      { x: 340, y: 260, vx: 0, vy: 0 },
      { x: 140, y: 300, vx: 0, vy: 0 },
      { x: 260, y: 360, vx: 0, vy: 0 },
    ];

    const contour = buildZoneContour(points, 0.55);

    expect(contour.length).toBeGreaterThanOrEqual(3);
    for (const point of points) {
      expect(polygonContainsPoint(contour, point)).toBe(true);
    }
  });
});
