import { describe, expect, it } from "vitest";

import { buildAnchorMap } from "./graphCanvasCore";

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
