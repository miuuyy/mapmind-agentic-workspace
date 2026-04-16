import React from "react";

import type { AppCopy } from "../lib/appCopy";
import type { DebugLogEntry, DebugLogSnapshot } from "../lib/types";

type FlatLogEntry = {
  source: string;
  entry: DebugLogEntry;
};

function flattenLogs(copy: AppCopy, logs: DebugLogSnapshot | null): FlatLogEntry[] {
  const rows: FlatLogEntry[] = [];

  for (const entry of logs?.frontend ?? []) {
    rows.push({ source: copy.settingsPanel.logsFrontend, entry });
  }
  for (const entry of logs?.api ?? []) {
    rows.push({ source: copy.settingsPanel.logsApi, entry });
  }
  for (const entry of logs?.server ?? []) {
    rows.push({ source: copy.settingsPanel.logsServer, entry });
  }

  rows.sort((left, right) => {
    const leftTime = Date.parse(left.entry.created_at);
    const rightTime = Date.parse(right.entry.created_at);
    return rightTime - leftTime;
  });

  return rows;
}

function renderEntry({ source, entry }: FlatLogEntry): React.JSX.Element {
  const hasDetails = Boolean(entry.request_excerpt || entry.response_excerpt || entry.stack);

  return (
    <li key={`${source}:${entry.id}`} className="debugLogRow">
      <div className="debugLogRowLine">
        <span className="debugLogRowSource">{source}</span>
        <span className="debugLogRowTime">{new Date(entry.created_at).toLocaleTimeString()}</span>
        {entry.method ? <span className="debugLogRowMethod">{entry.method}</span> : null}
        {entry.path ? <span className="debugLogRowPath">{entry.path}</span> : null}
        {entry.status_code != null ? <span className="debugLogRowStatus">HTTP {entry.status_code}</span> : null}
        {entry.duration_ms != null ? <span className="debugLogRowDuration">{entry.duration_ms} ms</span> : null}
      </div>
      <div className="debugLogRowTitle">{entry.title}</div>
      {entry.message ? <pre className="debugLogRowMessage">{entry.message}</pre> : null}
      {hasDetails ? (
        <details className="debugLogRowDetails">
          <summary>details</summary>
          {entry.request_excerpt ? (
            <div className="debugLogRowDetailBlock">
              <div className="debugLogRowDetailLabel">request</div>
              <pre>{entry.request_excerpt}</pre>
            </div>
          ) : null}
          {entry.response_excerpt ? (
            <div className="debugLogRowDetailBlock">
              <div className="debugLogRowDetailLabel">response</div>
              <pre>{entry.response_excerpt}</pre>
            </div>
          ) : null}
          {entry.stack ? (
            <div className="debugLogRowDetailBlock">
              <div className="debugLogRowDetailLabel">stack</div>
              <pre>{entry.stack}</pre>
            </div>
          ) : null}
        </details>
      ) : null}
    </li>
  );
}

export function DebugLogsModal({
  copy,
  open,
  onClose,
  logs,
  loading,
  error,
}: {
  copy: AppCopy;
  open: boolean;
  onClose(): void;
  logs: DebugLogSnapshot | null;
  loading: boolean;
  error: string | null;
}): React.JSX.Element | null {
  if (!open) return null;

  const entries = flattenLogs(copy, logs);

  return (
    <div
      className="quizOverlay settingsOverlay"
      style={{ zIndex: 110 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="settingsModal debugLogsModal">
        <div className="settingsContent">
          <div className="settingsContentHeader">
            <div>
              <h2>{copy.settingsPanel.logsTitle}</h2>
              <div className="mutedSmall">{copy.settingsPanel.logsSubtitle}</div>
              {logs ? (
                <div className="mutedSmall">
                  {copy.settingsPanel.logsFile}: {logs.file_path}
                </div>
              ) : null}
            </div>
            <button className="modalCloseButton" onClick={onClose} type="button" aria-label={copy.settingsPanel.logsClose}>
              <span style={{ transform: "translateY(-1px)", display: "block" }}>✕</span>
            </button>
          </div>
          <div className="debugLogsList">
            {loading && !logs ? <div className="debugLogPlaceholder">{copy.settingsPanel.refreshing}</div> : null}
            {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
            {!loading && !error && entries.length === 0 ? <div className="debugLogPlaceholder">No log entries yet</div> : null}
            {entries.length > 0 ? <ul className="debugLogsFlatList">{entries.map((entry) => renderEntry(entry))}</ul> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
