import React from "react";
import { Check } from "@phosphor-icons/react";

import type { GraphChatState } from "../../lib/appContracts";
import type { AppCopy } from "../../lib/appCopy";
import { renderDisplayText } from "../../lib/appUiHelpers";
import { summarizePreviewCounts, summarizeTopOperations } from "../../lib/graph";
import { ClewLoader } from "../ClewLoader";

type AssistantMessage = GraphChatState["messages"][number];
type AssistantProposal = NonNullable<AssistantMessage["proposal"]>;

export type AssistantThreadProps = {
  copy: AppCopy;
  chatViewportRef: React.RefObject<HTMLDivElement | null>;
  chatThreadLoading: boolean;
  currentChatState: GraphChatState;
  visibleMessages: AssistantMessage[];
  chatLoading: boolean;
  hasInlinePlanningWidget: boolean;
  applyLoadingMessageId: string | null;
  applyProposalFromMessage: (messageId: string, proposal: AssistantProposal) => Promise<void>;
  updateCurrentChatState: (updater: (current: GraphChatState) => GraphChatState) => void;
  chatComposerRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function AssistantThread({
  copy,
  chatViewportRef,
  chatThreadLoading,
  currentChatState,
  visibleMessages,
  chatLoading,
  hasInlinePlanningWidget,
  applyLoadingMessageId,
  applyProposalFromMessage,
  updateCurrentChatState,
  chatComposerRef,
}: AssistantThreadProps): React.JSX.Element {
  return (
    <div ref={chatViewportRef} className="assistantThread">
      {chatThreadLoading ? (
        <div className="assistantHello assistantHelloLoading" role="status" aria-label="Loading chat thread">
          <ClewLoader size={56} />
        </div>
      ) : null}
      {currentChatState.messages.length === 0 && !chatThreadLoading ? (
        <div className="assistantHello">
          <div className="assistantHelloTitle">{copy.sessions.helloTitle}</div>
          <div className="assistantHelloCopy">{copy.sessions.helloCopy}</div>
        </div>
      ) : null}
      {visibleMessages.length > 0 ? (
        visibleMessages.map((message) => {
          const proposal = message.proposal;
          const proposalCounts = proposal ? summarizePreviewCounts(proposal, copy) : [];
          const proposalHighlights = proposal ? summarizeTopOperations(proposal, copy) : [];
          return (
            <div key={message.id} className={`chatMessage chatMessage-${message.role}`}>
              <div className="chatBubble">
                <div className="chatCopy">{renderDisplayText(message.content)}</div>
                {message.inline_quiz ? (() => {
                  const quiz = message.inline_quiz;
                  const answered = quiz.answered_index != null;
                  return (
                    <div className="inlineQuizCard">
                      <div className="inlineQuizQuestion">{renderDisplayText(quiz.question)}</div>
                      <div className="inlineQuizChoices">
                        {quiz.choices.map((choice: string, idx: number) => {
                          let className = "inlineQuizChoice";
                          if (answered) {
                            if (idx === quiz.correct_index) className += " inlineQuizCorrect";
                            else if (idx === quiz.answered_index) className += " inlineQuizWrong";
                            else className += " inlineQuizDimmed";
                          }
                          return (
                            <button
                              key={idx}
                              className={className}
                              type="button"
                              disabled={answered || chatLoading}
                              onClick={() => {
                                const answeredMessages = currentChatState.messages.map((entry) =>
                                  entry.id === message.id && entry.inline_quiz
                                    ? { ...entry, inline_quiz: { ...entry.inline_quiz, answered_index: idx } }
                                    : entry,
                                );
                                updateCurrentChatState((prev) => ({
                                  ...prev,
                                  messages: answeredMessages,
                                }));
                              }}
                            >
                              {renderDisplayText(choice)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : null}
                {message.role === "assistant" && message.fallback_used ? (
                  <div className="chatMetaRow">
                    <span className="badge badge-yellow">{copy.sessions.fallbackUsed}</span>
                  </div>
                ) : null}
                {message.planning_status ? (
                  <div className="proposalInlineCard proposalInlinePending">
                    <div className="proposalInlinePendingRow">
                      <div className="proposalInlinePendingLabel">{message.planning_status}</div>
                      <div className="proposalInlinePendingDots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                ) : null}
                {message.planning_error ? (
                  <div className="inlineNotice inlineNoticeError">{message.planning_error}</div>
                ) : null}
                {proposal ? (
                  <div className="proposalInlineCard">
                    <div className="proposalInlineHead">
                      <div>
                        <div className="proposalInlineTitle">{proposal.display.summary}</div>
                        {proposal.proposal_envelope.assistant_message ? (
                          <div className="mutedSmall">{proposal.proposal_envelope.assistant_message}</div>
                        ) : null}
                      </div>
                      <button
                        className={`proposalAddButton${message.proposal_applied ? " proposalAddButtonApplied" : ""}`}
                        disabled={
                          applyLoadingMessageId === message.id ||
                          message.proposal_applied ||
                          !proposal.apply_plan.validation.ok
                        }
                        onClick={() => void applyProposalFromMessage(message.id, proposal)}
                        type="button"
                        aria-label={message.proposal_applied ? copy.sessions.proposalApplied : copy.sessions.addProposalToGraph}
                        title={message.proposal_applied ? copy.sessions.applied : copy.sessions.addProposalToGraph}
                      >
                        {applyLoadingMessageId === message.id
                          ? "…"
                          : message.proposal_applied
                            ? <span className="proposalAppliedMark" aria-hidden="true"><Check size={12} weight="bold" /></span>
                            : "+"}
                      </button>
                    </div>
                    {proposalCounts.length > 0 ? (
                      <div className="previewStatGrid">
                        {proposalCounts.map((item) => (
                          <div key={item.label} className="previewStatCard">
                            <strong>{item.value}</strong>
                            <span>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {proposalHighlights.length > 0 ? (
                      <div className="proposalMiniList">
                        {proposalHighlights.map((item, index) => (
                          <button
                            key={`${item.label}-${item.target}-${index}`}
                            className="proposalMiniItem"
                            type="button"
                            onClick={() => {
                              updateCurrentChatState((current) => ({
                                ...current,
                                input: `Expand from topic ${item.target} to topic: `,
                              }));
                              window.requestAnimationFrame(() => chatComposerRef.current?.focus());
                            }}
                          >
                            <span>{item.target}</span>
                            <span className="badge badge-gray">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {proposal.apply_plan.validation.errors.length > 0 ? (
                      <div className="stackCompact">
                        {proposal.apply_plan.validation.errors.map((entry) => (
                          <div key={entry} className="inlineNotice inlineNoticeError">
                            {entry}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {proposal.apply_plan.validation.warnings.length > 0 ? (
                      <div className="stackCompact">
                        {proposal.apply_plan.validation.warnings.map((entry) => (
                          <div key={entry} className="inlineNotice inlineNoticeWarn">
                            {entry}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      ) : null}
      {chatLoading && !hasInlinePlanningWidget ? (
        <div className="chatMessage chatMessage-assistant">
          <div className="chatBubble chatBubbleLoading">
            <span className="chatTypingDot" />
            <span className="chatTypingDot" />
            <span className="chatTypingDot" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
