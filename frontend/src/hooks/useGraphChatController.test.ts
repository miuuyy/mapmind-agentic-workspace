import { describe, expect, it } from "vitest";

import { assistantMessageFromStreamEvent } from "./useGraphChatController";
import type { ChatMessage } from "../lib/types";

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "Done",
  created_at: "2026-04-24T00:00:00Z",
};

describe("assistantMessageFromStreamEvent", () => {
  it("uses the explicit assistant message when present", () => {
    expect(assistantMessageFromStreamEvent({ type: "assistant_message", message: assistantMessage })).toEqual(assistantMessage);
  });

  it("falls back to the final thread message when the stream frame omits message", () => {
    expect(
      assistantMessageFromStreamEvent({
        type: "assistant_message",
        messages: [
          { id: "user-1", role: "user", content: "Hi", created_at: "2026-04-24T00:00:00Z" },
          assistantMessage,
        ],
      }),
    ).toEqual(assistantMessage);
  });

  it("rejects malformed assistant frames instead of returning undefined", () => {
    expect(assistantMessageFromStreamEvent({ type: "assistant_message", messages: [] })).toBeNull();
  });
});
