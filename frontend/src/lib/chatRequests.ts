import { readErrorMessage } from "./appUiHelpers";
import type { ChatMessage, ChatSessionSummary, GraphChatThread } from "./types";

export type ApiFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchChatSessions(
  apiFetch: ApiFetchLike,
  requestUrl: string,
  fallbackMessage: string,
): Promise<ChatSessionSummary[]> {
  const response = await apiFetch(requestUrl);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }
  return (await response.json()) as ChatSessionSummary[];
}

export async function markChatProposalApplied(
  apiFetch: ApiFetchLike,
  requestUrl: string,
  fallbackMessage: string,
): Promise<GraphChatThread> {
  const response = await apiFetch(requestUrl, { method: "POST" });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }
  return (await response.json()) as GraphChatThread;
}

function messagesEquivalent(left: ChatMessage, right: ChatMessage): boolean {
  return left.role === right.role && left.content === right.content && (left.hidden ?? false) === (right.hidden ?? false);
}

function serverThreadIsStaleSubset(serverMessages: ChatMessage[], localMessages: ChatMessage[]): boolean {
  if (serverMessages.length >= localMessages.length) return false;
  let localIndex = 0;
  for (const serverMessage of serverMessages) {
    while (localIndex < localMessages.length && !messagesEquivalent(localMessages[localIndex], serverMessage)) {
      localIndex += 1;
    }
    if (localIndex >= localMessages.length) return false;
    localIndex += 1;
  }
  return true;
}

export function reconcileThreadMessages(serverMessages: ChatMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  if (localMessages.length === 0) return serverMessages;
  if (serverMessages.length === 0) return localMessages;
  if (serverThreadIsStaleSubset(serverMessages, localMessages)) return localMessages;
  return serverMessages;
}
