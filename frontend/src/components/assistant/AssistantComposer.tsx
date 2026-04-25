import React from "react";

import type { GraphChatState } from "../../lib/appContracts";
import type { AppCopy } from "../../lib/appCopy";

type AssistantTemplate = {
  id: string;
  label: string;
  value: string;
};

export type AssistantComposerProps = {
  copy: AppCopy;
  chatError: string | null;
  chatSessionsError: string | null;
  applyError: string | null;
  composerUseGrounding: boolean;
  setComposerUseGrounding: React.Dispatch<React.SetStateAction<boolean>>;
  assistantTemplates: AssistantTemplate[];
  updateCurrentChatState: (updater: (current: GraphChatState) => GraphChatState) => void;
  chatComposerRef: React.RefObject<HTMLTextAreaElement | null>;
  currentChatState: GraphChatState;
  chatLoading: boolean;
  chatThreadLoading: boolean;
  sendChat: () => void;
};

export function AssistantComposer({
  copy,
  chatError,
  chatSessionsError,
  applyError,
  composerUseGrounding,
  setComposerUseGrounding,
  assistantTemplates,
  updateCurrentChatState,
  chatComposerRef,
  currentChatState,
  chatLoading,
  chatThreadLoading,
  sendChat,
}: AssistantComposerProps): React.JSX.Element {
  return (
    <div className="assistantComposerWrap">
      {chatError ? <div className="inlineNotice inlineNoticeError">{chatError}</div> : null}
      {chatSessionsError ? <div className="inlineNotice inlineNoticeError">{chatSessionsError}</div> : null}
      {applyError ? <div className="inlineNotice inlineNoticeError">{applyError}</div> : null}
      <div className="assistantTemplates">
        <button
          className={`assistantTemplate webGroundingToggle ${composerUseGrounding ? "active" : ""}`}
          onClick={() => setComposerUseGrounding((current) => !current)}
          title={copy.sessions.groundingToggle}
          type="button"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: "6px" }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Web
        </button>
        {assistantTemplates.map((template) => (
          <button
            key={template.id}
            className="assistantTemplate"
            onClick={() => {
              updateCurrentChatState((current) => ({
                ...current,
                input: template.value,
              }));
              window.requestAnimationFrame(() => chatComposerRef.current?.focus());
            }}
            type="button"
          >
            {template.label}
          </button>
        ))}
      </div>
      <div className="assistantComposer">
        <textarea
          ref={chatComposerRef}
          className="assistantInput"
          value={currentChatState.input}
          onChange={(event) =>
            updateCurrentChatState((current) => ({
              ...current,
              input: event.target.value,
            }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendChat();
            }
          }}
          placeholder={copy.sessions.composerPlaceholder}
        />
        <button
          className="assistantSendButton assistantSendButtonIcon"
          disabled={chatLoading || chatThreadLoading || !currentChatState.input.trim()}
          onClick={() => sendChat()}
          type="button"
        >
          {chatLoading ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-spin"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="M5 12L12 5L19 12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
