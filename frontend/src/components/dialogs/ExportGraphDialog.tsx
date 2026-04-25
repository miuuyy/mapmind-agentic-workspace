import React from "react";

import type { AppCopy } from "../../lib/appCopy";
import type { GraphEnvelope, GraphExportFormat, ObsidianExportOptions } from "../../lib/types";

function patchObsidianExportOptions(
  setOptions: React.Dispatch<React.SetStateAction<ObsidianExportOptions>>,
  patch: Partial<ObsidianExportOptions>,
): void {
  setOptions((current) => ({ ...current, ...patch }));
}

export function ExportGraphDialog({
  target,
  modalRef,
  titleInputRef,
  closeModal,
  titleDraft,
  setTitleDraft,
  includeProgressDraft,
  setIncludeProgressDraft,
  formatDraft,
  setFormatDraft,
  obsidianOptionsDraft,
  setObsidianOptionsDraft,
  error,
  loading,
  exportGraph,
  copy,
}: {
  target: GraphEnvelope | null;
  modalRef: React.RefObject<HTMLDivElement | null>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  closeModal: () => void;
  titleDraft: string;
  setTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  includeProgressDraft: boolean;
  setIncludeProgressDraft: React.Dispatch<React.SetStateAction<boolean>>;
  formatDraft: GraphExportFormat;
  setFormatDraft: React.Dispatch<React.SetStateAction<GraphExportFormat>>;
  obsidianOptionsDraft: ObsidianExportOptions;
  setObsidianOptionsDraft: React.Dispatch<React.SetStateAction<ObsidianExportOptions>>;
  error: string | null;
  loading: boolean;
  exportGraph: (graph: GraphEnvelope) => Promise<void>;
  copy: AppCopy;
}): React.JSX.Element | null {
  if (!target) return null;

  return (
    <div className="quizOverlay">
      <div
        ref={modalRef}
        className="quizModal exportGraphModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-graph-dialog-title"
        aria-describedby="export-graph-dialog-description"
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id="export-graph-dialog-title" className="cardTitle">{copy.dialogs.exportGraphTitle}</div>
            <div id="export-graph-dialog-description" className="mutedSmall">{copy.dialogs.exportGraphBody}</div>
          </div>
          <button className="modalCloseButton" onClick={closeModal} type="button" aria-label={copy.dialogs.cancel}>×</button>
        </div>
        <div className="quizModalBody stack">
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
            <input
              ref={titleInputRef}
              className="input"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder={copy.dialogs.exportTitlePlaceholder}
            />
          </label>
          <label className="field">
            <span className="fieldLabel">{copy.dialogs.exportFormat}</span>
            <select
              className="input"
              value={formatDraft}
              onChange={(event) => setFormatDraft(event.target.value as GraphExportFormat)}
            >
              <option value="mapmind_graph_export">{copy.dialogs.exportFormatClew}</option>
              <option value="mapmind_obsidian_export">{copy.dialogs.exportFormatObsidian}</option>
            </select>
          </label>
          <label className="settingsToggleRow exportSettingsToggleRow">
            <input
              type="checkbox"
              checked={includeProgressDraft}
              onChange={(event) => setIncludeProgressDraft(event.target.checked)}
            />
            <div className="settingsToggleCopy">
              <strong>{copy.dialogs.includeOwnProgress}</strong>
            </div>
          </label>
          {formatDraft === "mapmind_obsidian_export" ? (
            <div className="obsidianSettingsGrid exportSettingsGrid">
              <label className="settingsToggleRow exportSettingsToggleRow">
                <input
                  type="checkbox"
                  checked={obsidianOptionsDraft.use_folders_as_zones}
                  onChange={(event) => patchObsidianExportOptions(setObsidianOptionsDraft, { use_folders_as_zones: event.target.checked })}
                />
                <div className="settingsToggleCopy">
                  <strong>{copy.dialogs.obsidianUseFoldersAsZones}</strong>
                  <span>{copy.dialogs.obsidianUseFoldersAsZonesHelp}</span>
                </div>
              </label>
              <label className="settingsToggleRow exportSettingsToggleRow">
                <input
                  type="checkbox"
                  checked={obsidianOptionsDraft.include_descriptions}
                  onChange={(event) => patchObsidianExportOptions(setObsidianOptionsDraft, { include_descriptions: event.target.checked })}
                />
                <div className="settingsToggleCopy">
                  <strong>{copy.dialogs.obsidianIncludeDescriptions}</strong>
                </div>
              </label>
              <label className="settingsToggleRow exportSettingsToggleRow">
                <input
                  type="checkbox"
                  checked={obsidianOptionsDraft.include_resources}
                  onChange={(event) => patchObsidianExportOptions(setObsidianOptionsDraft, { include_resources: event.target.checked })}
                />
                <div className="settingsToggleCopy">
                  <strong>{copy.dialogs.obsidianIncludeResources}</strong>
                </div>
              </label>
              <label className="settingsToggleRow exportSettingsToggleRow">
                <input
                  type="checkbox"
                  checked={obsidianOptionsDraft.include_artifacts}
                  onChange={(event) => patchObsidianExportOptions(setObsidianOptionsDraft, { include_artifacts: event.target.checked })}
                />
                <div className="settingsToggleCopy">
                  <strong>{copy.dialogs.obsidianIncludeArtifacts}</strong>
                </div>
              </label>
            </div>
          ) : null}
          {formatDraft === "mapmind_obsidian_export" ? <div className="mutedSmall exportGraphHint">{copy.dialogs.obsidianExportHint}</div> : null}
          {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
          <div className="quizActions quizActionsRight">
            <button className="btn btnGhost" onClick={closeModal} type="button">{copy.dialogs.cancel}</button>
            <button
              className="assistantSendButton quizSubmitButton"
              disabled={loading || !titleDraft.trim()}
              onClick={() => void exportGraph(target)}
              type="button"
            >
              {loading ? copy.dialogs.exportingGraph : copy.dialogs.exportGraph}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
