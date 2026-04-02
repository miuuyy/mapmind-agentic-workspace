import { describe, expect, it, vi } from "vitest";

import { fetchChatSessions, markChatProposalApplied } from "./chatRequests";
import type { ChatMessage, ChatSessionSummary, GraphChatThread } from "./types";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("fetchChatSessions", () => {
  it("returns chat sessions when the request succeeds", async () => {
    const sessions: ChatSessionSummary[] = [
      {
        session_id: "session_1",
        graph_id: "graph_1",
        topic_id: "topic_1",
        title: "Linear algebra",
        created_at: "2026-04-02T08:00:00Z",
        updated_at: "2026-04-02T08:05:00Z",
        message_count: 3,
      },
    ];
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(sessions, { status: 200 }));

    await expect(fetchChatSessions(apiFetch, "/sessions", "Failed to load chat sessions")).resolves.toEqual(sessions);
  });

  it("surfaces the backend detail when chat sessions fail to load", async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "session storage unavailable" }, { status: 503 }),
    );

    await expect(fetchChatSessions(apiFetch, "/sessions", "Failed to load chat sessions")).rejects.toThrow(
      "session storage unavailable",
    );
  });
});

describe("markChatProposalApplied", () => {
  it("returns the refreshed thread when the sync succeeds", async () => {
    const messages: ChatMessage[] = [
      {
        id: "msg_1",
        role: "assistant",
        content: "Proposal is ready.",
        created_at: "2026-04-02T08:00:00Z",
        proposal_applied: true,
      },
    ];
    const thread: GraphChatThread = {
      session_id: "session_1",
      graph_id: "graph_1",
      topic_id: null,
      title: "General",
      created_at: "2026-04-02T08:00:00Z",
      updated_at: "2026-04-02T08:05:00Z",
      messages,
    };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(thread, { status: 200 }));

    await expect(markChatProposalApplied(apiFetch, "/applied", "Failed to sync proposal state")).resolves.toEqual(thread);
    expect(apiFetch).toHaveBeenCalledWith("/applied", { method: "POST" });
  });

  it("throws a sync-specific error when the applied flag refresh fails", async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      jsonResponse({ detail: "message sync timed out" }, { status: 504 }),
    );

    await expect(markChatProposalApplied(apiFetch, "/applied", "Failed to sync proposal state")).rejects.toThrow(
      "message sync timed out",
    );
  });
});
