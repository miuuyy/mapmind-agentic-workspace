import React from "react";
import { UploadSimple } from "@phosphor-icons/react";

import type { AppCopy } from "../../lib/appCopy";
import type { GraphExportPackagePayload } from "../../lib/types";

export function ImportGraphDialog({
  open,
  modalRef,
  closeModal,
  fileInputRef,
  fileButtonRef,
  handleImportFile,
  fileName,
  payload,
  titleDraft,
  setTitleDraft,
  includeProgressDraft,
  setIncludeProgressDraft,
  error,
  loading,
  importGraphFromPackage,
  copy,
}: {
  open: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  closeModal: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fileButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleImportFile: (file: File) => Promise<void>;
  fileName: string | null;
  payload: GraphExportPackagePayload | null;
  titleDraft: string;
  setTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  includeProgressDraft: boolean;
  setIncludeProgressDraft: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  loading: boolean;
  importGraphFromPackage: () => Promise<void>;
  copy: AppCopy;
}): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div className="quizOverlay">
      <div
        ref={modalRef}
        className="quizModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-graph-dialog-title"
        aria-describedby="import-graph-dialog-description"
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id="import-graph-dialog-title" className="cardTitle">{copy.dialogs.importGraphTitle}</div>
            <div id="import-graph-dialog-description" className="mutedSmall">{copy.dialogs.importGraphBody}</div>
          </div>
          <button className="modalCloseButton" onClick={closeModal} type="button" aria-label={copy.dialogs.cancel}>×</button>
        </div>
        <div className="quizModalBody stack">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.mapmind-graph.json,application/json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) {
                void handleImportFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <div className="stack" style={{ gap: 10 }}>
            <button
              ref={fileButtonRef}
              className="btn btnImport btnImportWide"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadSimple size={14} weight="bold" />
              <span>{copy.dialogs.chooseFile}</span>
            </button>
            <div className={`inlineNotice ${fileName ? "inlineNoticeSuccess" : "inlineNoticeWarn"}`}>
              {fileName ?? copy.dialogs.noFileChosen}
            </div>
          </div>
          {payload ? (
            <>
              <div className="inlineNotice inlineNoticeNeutral">
                {`${payload.graph.title} · ${payload.graph.topics.length} ${copy.library.nodes}`}
              </div>
              <label className="field">
                <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  placeholder={copy.dialogs.importTitlePlaceholder}
                />
              </label>
              <label className="settingsToggle">
                <input
                  type="checkbox"
                  checked={includeProgressDraft}
                  onChange={(event) => setIncludeProgressDraft(event.target.checked)}
                />
                <span>{copy.dialogs.importWithProgress}</span>
              </label>
            </>
          ) : null}
          {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
          <div className="quizActions quizActionsRight">
            <button className="btn btnGhost" onClick={closeModal} type="button">{copy.dialogs.cancel}</button>
            <button
              className="assistantSendButton quizSubmitButton"
              disabled={loading || !payload || !titleDraft.trim()}
              onClick={() => void importGraphFromPackage()}
              type="button"
            >
              {loading ? copy.dialogs.importingGraph : copy.dialogs.importGraph}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
