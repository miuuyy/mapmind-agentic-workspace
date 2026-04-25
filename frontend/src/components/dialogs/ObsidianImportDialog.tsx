import React from "react";

import type { AppCopy } from "../../lib/appCopy";
import type { ObsidianImportOptions, ObsidianImportPreview } from "../../lib/obsidianImport";
import type { CreateGraphRequest } from "../../lib/types";

type ObsidianIssue = ObsidianImportPreview["issues"][number];

type ObsidianImportDraft = Omit<ObsidianImportOptions, "vaultName">;

export function ObsidianImportDialog({
  open,
  modalRef,
  closeModal,
  folderInputRef,
  folderButtonRef,
  handleVaultFiles,
  vaultName,
  draft,
  setDraft,
  preview,
  issues,
  warnings,
  errors,
  loading,
  error,
  importGraphFromObsidian,
  copy,
}: {
  open: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  closeModal: () => void;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  folderButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleVaultFiles: (files: FileList | null) => Promise<void>;
  vaultName: string | null;
  draft: ObsidianImportDraft;
  setDraft: React.Dispatch<React.SetStateAction<ObsidianImportDraft>>;
  preview: ObsidianImportPreview | null;
  issues: ObsidianIssue[];
  warnings: ObsidianIssue[];
  errors: ObsidianIssue[];
  loading: boolean;
  error: string | null;
  importGraphFromObsidian: () => Promise<void>;
  copy: AppCopy;
}): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div className="quizOverlay">
      <div
        ref={modalRef}
        className="quizModal quizModalWide obsidianImportModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-obsidian-dialog-title"
        aria-describedby="import-obsidian-dialog-description"
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id="import-obsidian-dialog-title" className="cardTitle">{copy.dialogs.importObsidianTitle}</div>
            <div id="import-obsidian-dialog-description" className="mutedSmall">{copy.dialogs.importObsidianBody}</div>
          </div>
          <button className="modalCloseButton" onClick={closeModal} type="button" aria-label={copy.dialogs.cancel}>×</button>
        </div>
        <div className="quizModalBody stack">
          <input
            ref={folderInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(event) => {
              void handleVaultFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <div className="stack" style={{ gap: 10 }}>
            <button
              ref={folderButtonRef}
              className="btn btnImport btnImportWide"
              type="button"
              onClick={() => folderInputRef.current?.click()}
            >
              <span>{copy.dialogs.chooseVaultFolder}</span>
            </button>
            <div className={`obsidianVaultSummary ${vaultName ? "obsidianVaultSummaryReady" : "obsidianVaultSummaryEmpty"}`}>
              <span className="obsidianVaultSummaryLabel">{copy.dialogs.obsidianVault}</span>
              <strong className="obsidianVaultSummaryValue">{vaultName ?? copy.dialogs.noVaultChosen}</strong>
            </div>
          </div>

          {vaultName ? (
            <>
              <div className="obsidianImportGrid">
                <label className="field">
                  <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
                  <input
                    className="input"
                    value={draft.graphTitle}
                    onChange={(event) => setDraft((current) => ({ ...current, graphTitle: event.target.value }))}
                    placeholder={copy.dialogs.graphTitlePlaceholder}
                  />
                </label>
                <label className="field">
                  <span className="fieldLabel">{copy.dialogs.obsidianSubject}</span>
                  <input
                    className="input"
                    value={draft.subject}
                    onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                    placeholder={copy.dialogs.obsidianSubjectPlaceholder}
                  />
                </label>
                <label className="field">
                  <span className="fieldLabel">{copy.dialogs.language}</span>
                  <select
                    className="input"
                    value={draft.language}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        language: event.target.value as CreateGraphRequest["language"],
                      }))
                    }
                  >
                    <option value="uk">{copy.dialogs.languageOptions.uk}</option>
                    <option value="ru">{copy.dialogs.languageOptions.ru}</option>
                    <option value="en">{copy.dialogs.languageOptions.en}</option>
                  </select>
                </label>
                <label className="field">
                  <span className="fieldLabel">{copy.dialogs.obsidianRelation}</span>
                  <select
                    className="input"
                    value={draft.relation}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        relation: event.target.value as ObsidianImportOptions["relation"],
                      }))
                    }
                  >
                    <option value="requires">{copy.dialogs.obsidianRelationOptions.requires}</option>
                    <option value="supports">{copy.dialogs.obsidianRelationOptions.supports}</option>
                    <option value="bridges">{copy.dialogs.obsidianRelationOptions.bridges}</option>
                    <option value="extends">{copy.dialogs.obsidianRelationOptions.extends}</option>
                    <option value="reviews">{copy.dialogs.obsidianRelationOptions.reviews}</option>
                  </select>
                  <span className="mutedSmall">{copy.dialogs.obsidianRelationHelp}</span>
                </label>
              </div>

              <div className="obsidianSettingsGrid">
                <label className="settingsToggleRow">
                  <input
                    type="checkbox"
                    checked={draft.useFoldersAsZones}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        useFoldersAsZones: event.target.checked,
                      }))
                    }
                  />
                  <div className="settingsToggleCopy">
                    <strong>{copy.dialogs.obsidianFoldersAsZones}</strong>
                    <span>{copy.dialogs.obsidianFoldersAsZonesHelp}</span>
                  </div>
                </label>
                <label className="settingsToggleRow">
                  <input
                    type="checkbox"
                    checked={draft.autofillDescriptions}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        autofillDescriptions: event.target.checked,
                      }))
                    }
                  />
                  <div className="settingsToggleCopy">
                    <strong>{copy.dialogs.obsidianAutofillDescriptions}</strong>
                    <span>{copy.dialogs.obsidianAutofillDescriptionsHelp}</span>
                  </div>
                </label>
                <label className="settingsToggleRow">
                  <input
                    type="checkbox"
                    checked={draft.createArtifactsFromNotes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createArtifactsFromNotes: event.target.checked,
                      }))
                    }
                  />
                  <div className="settingsToggleCopy">
                    <strong>{copy.dialogs.obsidianCreateArtifacts}</strong>
                    <span>{copy.dialogs.obsidianCreateArtifactsHelp}</span>
                  </div>
                </label>
                <label className="settingsToggleRow">
                  <input
                    type="checkbox"
                    checked={draft.createPlaceholderTopics}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        createPlaceholderTopics: event.target.checked,
                      }))
                    }
                  />
                  <div className="settingsToggleCopy">
                    <strong>{copy.dialogs.obsidianCreatePlaceholders}</strong>
                    <span>{copy.dialogs.obsidianCreatePlaceholdersHelp}</span>
                  </div>
                </label>
              </div>

              {preview ? (
                <>
                  {errors.length > 0 ? (
                    <div className="inlineNotice inlineNoticeError">
                      {copy.dialogs.obsidianImportBlocked}
                    </div>
                  ) : null}
                  <div className="obsidianPreviewStats">
                    <div className="previewStatCard">
                      <strong>{preview.noteCount}</strong>
                      <span>{copy.dialogs.obsidianNotesCount}</span>
                    </div>
                    <div className="previewStatCard">
                      <strong>{warnings.length}</strong>
                      <span>{copy.dialogs.obsidianWarningsCount}</span>
                    </div>
                    <div className="previewStatCard">
                      <strong>{errors.length}</strong>
                      <span>{copy.dialogs.obsidianErrorsCount}</span>
                    </div>
                  </div>
                  {issues.length === 0 ? (
                    <div className="inlineNotice inlineNoticeSuccess">{copy.dialogs.obsidianNoIssues}</div>
                  ) : (
                    <div className="obsidianIssueList">
                      {issues.map((issue, index) => (
                        <div
                          key={`${issue.code}-${index}`}
                          className={`inlineNotice ${issue.level === "error" ? "inlineNoticeError" : "inlineNoticeWarn"}`}
                        >
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
          <div className="quizActions quizActionsRight">
            <button className="btn btnGhost" onClick={closeModal} type="button">{copy.dialogs.cancel}</button>
            <button
              className="assistantSendButton quizSubmitButton"
              disabled={loading || !preview?.package || !draft.graphTitle.trim() || !draft.subject.trim()}
              onClick={() => void importGraphFromObsidian()}
              type="button"
            >
              {loading ? copy.dialogs.importingObsidian : copy.dialogs.importFromObsidian}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
