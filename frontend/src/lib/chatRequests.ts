import { readErrorMessage } from "./appUiHelpers";
import type { ChatSessionSummary, GraphChatThread } from "./types";

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
