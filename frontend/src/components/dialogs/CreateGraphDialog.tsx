import React from "react";
import { UploadSimple } from "@phosphor-icons/react";

import type { AppCopy } from "../../lib/appCopy";
import type { CreateGraphRequest } from "../../lib/types";

export function CreateGraphDialog({
  open,
  modalRef,
  closeModal,
  titleInputRef,
  draft,
  setDraft,
  error,
  loading,
  openImportObsidianModal,
  openImportGraphModal,
  createGraph,
  copy,
}: {
  open: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  closeModal: () => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  draft: CreateGraphRequest;
  setDraft: React.Dispatch<React.SetStateAction<CreateGraphRequest>>;
  error: string | null;
  loading: boolean;
  openImportObsidianModal: () => void;
  openImportGraphModal: () => void;
  createGraph: () => Promise<void>;
  copy: AppCopy;
}): React.JSX.Element | null {
  if (!open) return null;

  const patch = (next: Partial<CreateGraphRequest>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };

  return (
    <div className="quizOverlay">
      <div
        ref={modalRef}
        className="quizModal workspaceCreateModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-graph-dialog-title"
        aria-describedby="create-graph-dialog-description"
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id="create-graph-dialog-title" className="cardTitle">{copy.dialogs.createGraphTitle}</div>
            <div id="create-graph-dialog-description" className="mutedSmall">{copy.dialogs.createGraphBody}</div>
          </div>
          <button
            className="modalCloseButton"
            onClick={closeModal}
            type="button"
            aria-label={copy.dialogs.createGraphAria}
          >
            ×
          </button>
        </div>
        <div className="quizModalBody stack">
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
            <input
              ref={titleInputRef}
              className="input"
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder={copy.dialogs.graphTitlePlaceholder}
            />
          </label>
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.subject}</span>
            <input
              className="input"
              value={draft.subject}
              onChange={(event) => patch({ subject: event.target.value })}
              placeholder={copy.dialogs.subjectPlaceholder}
            />
          </label>
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.language}</span>
            <select
              className="input"
              value={draft.language}
              onChange={(event) => patch({ language: event.target.value as CreateGraphRequest["language"] })}
            >
              <option value="uk">{copy.dialogs.languageOptions.uk}</option>
              <option value="ru">{copy.dialogs.languageOptions.ru}</option>
              <option value="en">{copy.dialogs.languageOptions.en}</option>
            </select>
          </label>
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.description}</span>
            <textarea
              className="textarea textareaCompact textareaPersona"
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={copy.dialogs.descriptionPlaceholder}
            />
          </label>
          {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
          <div className="quizActions">
            <div className="quizActionsGroup">
              <button
                className="btn btnImport"
                onClick={openImportObsidianModal}
                type="button"
              >
                <span>{copy.dialogs.importFromObsidian}</span>
              </button>
              <button
                className="btn btnImport"
                onClick={openImportGraphModal}
                type="button"
              >
                <UploadSimple size={14} weight="bold" />
                <span>{copy.dialogs.importFromDisk}</span>
              </button>
            </div>
            <button
              className="assistantSendButton quizSubmitButton"
              disabled={loading || !draft.title.trim() || !draft.subject.trim()}
              onClick={() => void createGraph()}
              type="button"
            >
              {loading ? copy.dialogs.creating : copy.dialogs.createGraph}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
