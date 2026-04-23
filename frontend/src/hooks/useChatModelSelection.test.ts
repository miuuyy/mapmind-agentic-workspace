import { describe, expect, it } from "vitest";

import { resolveSelectedChatModel } from "./useChatModelSelection";

describe("resolveSelectedChatModel", () => {
  it("keeps the current model when staying on the same graph", () => {
    expect(
      resolveSelectedChatModel({
        current: "gemini-2.5-flash",
        storedModel: "gemini-2.5-pro",
        chatModelOptions: ["gemini-2.5-pro", "gemini-2.5-flash"],
        defaultModel: "gemini-2.5-pro",
        graphChanged: false,
      }),
    ).toBe("gemini-2.5-flash");
  });

  it("prefers the new graph's stored model after a graph switch", () => {
    expect(
      resolveSelectedChatModel({
        current: "gemini-2.5-flash",
        storedModel: "gemini-2.5-pro",
        chatModelOptions: ["gemini-2.5-pro", "gemini-2.5-flash"],
        defaultModel: "gemini-2.5-flash",
        graphChanged: true,
      }),
    ).toBe("gemini-2.5-pro");
  });

  it("falls back to the graph default when the stored model is invalid", () => {
    expect(
      resolveSelectedChatModel({
        current: "gemini-2.5-flash",
        storedModel: "gpt-5.4",
        chatModelOptions: ["gemini-2.5-pro", "gemini-2.5-flash"],
        defaultModel: "gemini-2.5-pro",
        graphChanged: true,
      }),
    ).toBe("gemini-2.5-pro");
  });
});
