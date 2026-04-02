import React from "react";

import type { AppCopy } from "../lib/appCopy";
import type { DebugLogEntry, DebugLogSnapshot } from "../lib/types";


function renderEntry(entry: DebugLogEntry): React.JSX.Element {
  return (
    <div key={entry.id} className="debugLogEntry">
      <div className="debugLogMeta">
        <span>{new Date(entry.created_at).toLocaleTimeString()}</span>
        {entry.method && entry.path ? <span>{entry.method} {entry.path}</span> : null}
        {entry.status_code != null ? <span>HTTP {entry.status_code}</span> : null}
        {entry.duration_ms != null ? <span>{entry.duration_ms} ms</span> : null}
      </div>
      <div className="debugLogTitle">{entry.title}</div>
      <pre className="debugLogBody">{entry.message}</pre>
      {entry.request_excerpt ? (
        <details className="debugLogDetails">
          <summary>request</summary>
          <pre>{entry.request_excerpt}</pre>
        </details>
      ) : null}
      {entry.response_excerpt ? (
        <details className="debugLogDetails">
          <summary>response</summary>
          <pre>{entry.response_excerpt}</pre>
        </details>
      ) : null}
      {entry.stack ? (
        <details className="debugLogDetails">
          <summary>stack</summary>
          <pre>{entry.stack}</pre>
        </details>
      ) : null}
    </div>
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

  const columns: Array<[string, DebugLogEntry[]]> = [
    [copy.settingsPanel.logsFrontend, logs?.frontend ?? []],
    [copy.settingsPanel.logsApi, logs?.api ?? []],
    [copy.settingsPanel.logsServer, logs?.server ?? []],
  ];

  return (
    <div className="quizOverlay settingsOverlay" style={{ zIndex: 110 }}>
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
          <div className="debugLogsGrid">
            {columns.map(([label, entries]) => (
              <section key={label} className="debugLogColumn">
                <div className="debugLogColumnHeader">{label}</div>
                <div className="debugLogColumnBody">
                  {loading && !logs ? <div className="debugLogPlaceholder">{copy.settingsPanel.refreshing}</div> : null}
                  {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
                  {entries.map((entry) => renderEntry(entry as DebugLogEntry))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
