import React from "react";
import { UploadSimple } from "@phosphor-icons/react";

import { API_BASE } from "../lib/api";
import type { AppCopy } from "../lib/appCopy";
import type { apiFetch, readErrorMessage } from "../lib/appUiHelpers";
import type {
  CreateGraphRequest,
  GraphEnvelope,
  GraphExportPackagePayload,
  QuizQuestionReview,
  Topic,
  TopicQuizSession,
  WorkspaceEnvelope,
} from "../lib/types";

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

type AppDialogsProps = {
  copy: AppCopy;
  deleteConfirm: { graphId: string; title: string } | null;
  deleteGraphModalRef: React.RefObject<HTMLDivElement | null>;
  closeDeleteGraphModal: () => void;
  deleteGraphCancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  apiFetch: typeof apiFetch;
  readErrorMessage: typeof readErrorMessage;
  setDeleteConfirm: StateSetter<{ graphId: string; title: string } | null>;
  setData: StateSetter<WorkspaceEnvelope | null>;
  setActiveGraphId: StateSetter<string | null>;
  clearChatStateForGraph: (graphId: string | null | undefined) => void;
  loadSnapshots: () => Promise<void>;
  loadSessionInfo: () => Promise<unknown>;
  setError: StateSetter<string | null>;
  sessionDeleteConfirm: { sessionId: string; title: string } | null;
  sessionDeleteModalRef: React.RefObject<HTMLDivElement | null>;
  closeSessionDeleteModal: () => void;
  sessionDeleteCancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  setSessionDeleteConfirm: StateSetter<{ sessionId: string; title: string } | null>;
  activeGraph: GraphEnvelope | null;
  activeSessionId: string | null;
  setActiveSessionId: StateSetter<string | null>;
  loadSessions: () => Promise<void>;
  createGraphOpen: boolean;
  createGraphModalRef: React.RefObject<HTMLDivElement | null>;
  closeCreateGraphModal: () => void;
  createGraphTitleInputRef: React.RefObject<HTMLInputElement | null>;
  createGraphDraft: CreateGraphRequest;
  setCreateGraphDraft: StateSetter<CreateGraphRequest>;
  createGraphError: string | null;
  openImportGraphModal: () => void;
  createGraphLoading: boolean;
  createGraph: () => Promise<void>;
  importGraphOpen: boolean;
  importGraphModalRef: React.RefObject<HTMLDivElement | null>;
  closeImportGraphModal: () => void;
  importGraphFileInputRef: React.RefObject<HTMLInputElement | null>;
  importGraphFileButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleImportGraphFile: (file: File) => Promise<void>;
  importGraphFileName: string | null;
  importGraphPayload: GraphExportPackagePayload | null;
  importGraphTitleDraft: string;
  setImportGraphTitleDraft: StateSetter<string>;
  importGraphIncludeProgressDraft: boolean;
  setImportGraphIncludeProgressDraft: StateSetter<boolean>;
  importGraphError: string | null;
  importGraphLoading: boolean;
  importGraphFromPackage: () => Promise<void>;
  exportGraphTarget: GraphEnvelope | null;
  exportGraphModalRef: React.RefObject<HTMLDivElement | null>;
  closeExportGraphModal: () => void;
  exportGraphTitleInputRef: React.RefObject<HTMLInputElement | null>;
  exportGraphTitleDraft: string;
  setExportGraphTitleDraft: StateSetter<string>;
  exportGraphIncludeProgressDraft: boolean;
  setExportGraphIncludeProgressDraft: StateSetter<boolean>;
  exportGraphError: string | null;
  exportGraphLoading: boolean;
  exportGraph: (graph: GraphEnvelope) => Promise<void>;
  quizSession: TopicQuizSession | null;
  quizModalRef: React.RefObject<HTMLDivElement | null>;
  quizCloseButtonRef: React.RefObject<HTMLButtonElement | null>;
  selectedTopic: Topic | null;
  closeQuizModal: () => void;
  quizError: string | null;
  quizReviews: QuizQuestionReview[] | null;
  quizAnswers: Record<string, number>;
  setQuizAnswers: StateSetter<Record<string, number>>;
  quizLoading: boolean;
  submitQuiz: () => Promise<void>;
};

export function AppDialogs(props: AppDialogsProps): React.JSX.Element {
  const {
    copy,
    deleteConfirm,
    deleteGraphModalRef,
    closeDeleteGraphModal,
    deleteGraphCancelButtonRef,
    apiFetch,
    readErrorMessage,
    setDeleteConfirm,
    setData,
    setActiveGraphId,
    clearChatStateForGraph,
    loadSnapshots,
    loadSessionInfo,
    setError,
    sessionDeleteConfirm,
    sessionDeleteModalRef,
    closeSessionDeleteModal,
    sessionDeleteCancelButtonRef,
    setSessionDeleteConfirm,
    activeGraph,
    activeSessionId,
    setActiveSessionId,
    loadSessions,
    createGraphOpen,
    createGraphModalRef,
    closeCreateGraphModal,
    createGraphTitleInputRef,
    createGraphDraft,
    setCreateGraphDraft,
    createGraphError,
    openImportGraphModal,
    createGraphLoading,
    createGraph,
    importGraphOpen,
    importGraphModalRef,
    closeImportGraphModal,
    importGraphFileInputRef,
    importGraphFileButtonRef,
    handleImportGraphFile,
    importGraphFileName,
    importGraphPayload,
    importGraphTitleDraft,
    setImportGraphTitleDraft,
    importGraphIncludeProgressDraft,
    setImportGraphIncludeProgressDraft,
    importGraphError,
    importGraphLoading,
    importGraphFromPackage,
    exportGraphTarget,
    exportGraphModalRef,
    closeExportGraphModal,
    exportGraphTitleInputRef,
    exportGraphTitleDraft,
    setExportGraphTitleDraft,
    exportGraphIncludeProgressDraft,
    setExportGraphIncludeProgressDraft,
    exportGraphError,
    exportGraphLoading,
    exportGraph,
    quizSession,
    quizModalRef,
    quizCloseButtonRef,
    selectedTopic,
    closeQuizModal,
    quizError,
    quizReviews,
    quizAnswers,
    setQuizAnswers,
    quizLoading,
    submitQuiz,
  } = props;

  function patchCreateGraphDraft(patch: Partial<CreateGraphRequest>): void {
    setCreateGraphDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <>
      {deleteConfirm ? (
        <div className="quizOverlay">
          <div
            ref={deleteGraphModalRef}
            className="quizModal"
            style={{ maxWidth: 400 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-graph-dialog-title"
            aria-describedby="delete-graph-dialog-description"
            tabIndex={-1}
          >
            <div className="quizModalHeader">
              <div>
                <div id="delete-graph-dialog-title" className="cardTitle">{copy.dialogs.deleteGraphTitle}</div>
                <div id="delete-graph-dialog-description" className="mutedSmall">{copy.dialogs.deleteGraphBody}</div>
              </div>
              <button className="modalCloseButton" onClick={closeDeleteGraphModal} type="button">✕</button>
            </div>
            <div className="quizModalBody stack">
              <p style={{ margin: "0 0 6px", color: "var(--text-secondary)" }}>
                {copy.dialogs.deleteGraphConfirm(deleteConfirm.title)}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button ref={deleteGraphCancelButtonRef} className="btn btnGhost" onClick={closeDeleteGraphModal} type="button">{copy.dialogs.cancel}</button>
                <button
                  className="btn btnDanger"
                  type="button"
                  onClick={async () => {
                    const { graphId } = deleteConfirm;
                    setDeleteConfirm(null);
                    try {
                      const response = await apiFetch(`${API_BASE}/api/v1/workspace/graphs/${graphId}`, { method: "DELETE" });
                      if (!response.ok) throw new Error(await readErrorMessage(response, copy.errors.deleteGraph));
                      const payload = await response.json();
                      clearChatStateForGraph(graphId);
                      setData(payload);
                      setActiveGraphId(payload.workspace.active_graph_id ?? payload.workspace.graphs[0]?.graph_id ?? null);
                      void loadSnapshots();
                      void loadSessionInfo();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : copy.errors.deleteGraph);
                    }
                  }}
                >
                  {copy.dialogs.delete}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {sessionDeleteConfirm && activeGraph ? (
        <div className="quizOverlay">
          <div
            ref={sessionDeleteModalRef}
            className="quizModal"
            style={{ maxWidth: 400 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-dialog-title"
            aria-describedby="delete-session-dialog-description"
            tabIndex={-1}
          >
            <div className="quizModalHeader">
              <div>
                <div id="delete-session-dialog-title" className="cardTitle">{copy.dialogs.deleteChatSessionTitle}</div>
                <div id="delete-session-dialog-description" className="mutedSmall">{copy.dialogs.deleteChatSessionBody}</div>
              </div>
              <button className="modalCloseButton" onClick={closeSessionDeleteModal} type="button">✕</button>
            </div>
            <div className="quizModalBody stack">
              <p style={{ margin: "0 0 6px", color: "var(--text-secondary)" }}>
                {copy.dialogs.deleteChatSessionConfirm(sessionDeleteConfirm.title)}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button ref={sessionDeleteCancelButtonRef} className="btn btnGhost" onClick={closeSessionDeleteModal} type="button">{copy.dialogs.cancel}</button>
                <button
                  className="btn btnDanger"
                  type="button"
                  onClick={async () => {
                    const { sessionId } = sessionDeleteConfirm;
                    setSessionDeleteConfirm(null);
                    try {
                      const resp = await apiFetch(`${API_BASE}/api/v1/graphs/${activeGraph.graph_id}/chat/sessions/${sessionId}`, { method: "DELETE" });
                      if (!resp.ok) {
                        const msg = await readErrorMessage(resp, copy.errors.deleteSession);
                        setError(msg);
                        return;
                      }
                      if (activeSessionId === sessionId) setActiveSessionId(null);
                      void loadSessions();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : copy.errors.deleteSession);
                    }
                  }}
                >
                  {copy.dialogs.delete}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createGraphOpen ? (
        <div className="quizOverlay">
          <div
            ref={createGraphModalRef}
            className="quizModal"
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
                onClick={closeCreateGraphModal}
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
                  ref={createGraphTitleInputRef}
                  className="input"
                  value={createGraphDraft.title}
                  onChange={(event) => patchCreateGraphDraft({ title: event.target.value })}
                  placeholder={copy.dialogs.graphTitlePlaceholder}
                />
              </label>
              <label className="field">
                <span className="fieldLabel">{copy.dialogs.subject}</span>
                <input
                  className="input"
                  value={createGraphDraft.subject}
                  onChange={(event) => patchCreateGraphDraft({ subject: event.target.value })}
                  placeholder={copy.dialogs.subjectPlaceholder}
                />
              </label>
              <label className="field">
                <span className="fieldLabel">{copy.dialogs.language}</span>
                <select
                  className="input"
                  value={createGraphDraft.language}
                  onChange={(event) => patchCreateGraphDraft({ language: event.target.value as CreateGraphRequest["language"] })}
                >
                  <option value="uk">{copy.dialogs.languageOptions.uk}</option>
                  <option value="ru">{copy.dialogs.languageOptions.ru}</option>
                  <option value="en">{copy.dialogs.languageOptions.en}</option>
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">{copy.dialogs.description}</span>
                <textarea
                  className="textarea textareaCompact"
                  value={createGraphDraft.description}
                  onChange={(event) => patchCreateGraphDraft({ description: event.target.value })}
                  placeholder={copy.dialogs.descriptionPlaceholder}
                />
              </label>
              {createGraphError ? <div className="inlineNotice inlineNoticeError">{createGraphError}</div> : null}
              <div className="quizActions">
                <button
                  className="btn btnImport"
                  onClick={openImportGraphModal}
                  type="button"
                >
                  <UploadSimple size={14} weight="bold" />
                  <span>{copy.dialogs.importFromDisk}</span>
                </button>
                <button
                  className="assistantSendButton quizSubmitButton"
                  disabled={createGraphLoading || !createGraphDraft.title.trim() || !createGraphDraft.subject.trim()}
                  onClick={() => void createGraph()}
                  type="button"
                >
                  {createGraphLoading ? copy.dialogs.creating : copy.dialogs.createGraph}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {importGraphOpen ? (
        <div className="quizOverlay">
          <div
            ref={importGraphModalRef}
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
              <button className="modalCloseButton" onClick={closeImportGraphModal} type="button" aria-label={copy.dialogs.cancel}>×</button>
            </div>
            <div className="quizModalBody stack">
              <input
                ref={importGraphFileInputRef}
                type="file"
                accept=".json,.mapmind-graph.json,application/json"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file) {
                    void handleImportGraphFile(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
              <div className="stack" style={{ gap: 10 }}>
                <button
                  ref={importGraphFileButtonRef}
                  className="btn btnImport btnImportWide"
                  type="button"
                  onClick={() => importGraphFileInputRef.current?.click()}
                >
                  <UploadSimple size={14} weight="bold" />
                  <span>{copy.dialogs.chooseFile}</span>
                </button>
                <div className={`inlineNotice ${importGraphFileName ? "inlineNoticeSuccess" : "inlineNoticeWarn"}`}>
                  {importGraphFileName ?? copy.dialogs.noFileChosen}
                </div>
              </div>
              {importGraphPayload ? (
                <>
                  <div className="inlineNotice inlineNoticeNeutral">
                    {`${importGraphPayload.graph.title} · ${importGraphPayload.graph.topics.length} ${copy.library.nodes}`}
                  </div>
                  <label className="field">
                    <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
                    <input
                      className="input"
                      value={importGraphTitleDraft}
                      onChange={(event) => setImportGraphTitleDraft(event.target.value)}
                      placeholder={copy.dialogs.importTitlePlaceholder}
                    />
                  </label>
                  <label className="settingsToggle">
                    <input
                      type="checkbox"
                      checked={importGraphIncludeProgressDraft}
                      onChange={(event) => setImportGraphIncludeProgressDraft(event.target.checked)}
                    />
                    <span>{copy.dialogs.importWithProgress}</span>
                  </label>
                </>
              ) : null}
              {importGraphError ? <div className="inlineNotice inlineNoticeError">{importGraphError}</div> : null}
              <div className="quizActions quizActionsRight">
                <button className="btn btnGhost" onClick={closeImportGraphModal} type="button">{copy.dialogs.cancel}</button>
                <button
                  className="assistantSendButton quizSubmitButton"
                  disabled={importGraphLoading || !importGraphPayload || !importGraphTitleDraft.trim()}
                  onClick={() => void importGraphFromPackage()}
                  type="button"
                >
                  {importGraphLoading ? copy.dialogs.importingGraph : copy.dialogs.importGraph}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {exportGraphTarget ? (
        <div className="quizOverlay">
          <div
            ref={exportGraphModalRef}
            className="quizModal"
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
              <button className="modalCloseButton" onClick={closeExportGraphModal} type="button" aria-label={copy.dialogs.cancel}>×</button>
            </div>
            <div className="quizModalBody stack">
              <label className="field">
                <span className="fieldLabel">{copy.dialogs.graphTitle}</span>
                <input
                  ref={exportGraphTitleInputRef}
                  className="input"
                  value={exportGraphTitleDraft}
                  onChange={(event) => setExportGraphTitleDraft(event.target.value)}
                  placeholder={copy.dialogs.exportTitlePlaceholder}
                />
              </label>
              <label className="settingsToggle">
                <input
                  type="checkbox"
                  checked={exportGraphIncludeProgressDraft}
                  onChange={(event) => setExportGraphIncludeProgressDraft(event.target.checked)}
                />
                <span>{copy.dialogs.includeOwnProgress}</span>
              </label>
              {exportGraphError ? <div className="inlineNotice inlineNoticeError">{exportGraphError}</div> : null}
              <div className="quizActions quizActionsRight">
                <button className="btn btnGhost" onClick={closeExportGraphModal} type="button">{copy.dialogs.cancel}</button>
                <button
                  className="assistantSendButton quizSubmitButton"
                  disabled={exportGraphLoading || !exportGraphTitleDraft.trim()}
                  onClick={() => void exportGraph(exportGraphTarget)}
                  type="button"
                >
                  {exportGraphLoading ? copy.dialogs.exportingGraph : copy.dialogs.exportGraph}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quizSession ? (
        <div className="quizOverlay">
          <div
            ref={quizModalRef}
            className="quizModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-dialog-title"
            aria-describedby="quiz-dialog-description"
            tabIndex={-1}
          >
            <div className="quizModalHeader">
              <div>
                <div id="quiz-dialog-title" className="cardTitle">{copy.quiz.title}</div>
                <div id="quiz-dialog-description" className="mutedSmall">{selectedTopic?.title ?? copy.quiz.selectedTopic}</div>
              </div>
              <button
                ref={quizCloseButtonRef}
                className="modalCloseButton"
                onClick={closeQuizModal}
                type="button"
                aria-label={copy.quiz.closeQuiz}
              >
                ×
              </button>
            </div>
            <div className="quizModalBody stack">
              {quizError ? <div className="inlineNotice inlineNoticeError">{quizError}</div> : null}
              {quizReviews ? (
                <div className="stack">
                  {quizReviews.map((review) => (
                    <div key={review.question_id} className="quizQuestion">
                      <div className="quizPrompt">{review.prompt}</div>
                      <div className={review.was_correct ? "inlineNotice inlineNoticeSuccess" : "inlineNotice inlineNoticeError"}>
                        {review.was_correct ? copy.quiz.correct : copy.quiz.incorrect} · {copy.quiz.correctAnswer(review.correct_choice)}
                      </div>
                      {!review.was_correct && review.selected_choice ? <div className="quizReviewLine quizReviewWrong">{copy.quiz.yourAnswer(review.selected_choice)}</div> : null}
                      {review.explanation ? <div className="quizReviewLine">{review.explanation}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stack">
                  {quizSession.questions.map((question) => (
                    <div key={question.id} className="quizQuestion">
                      <div className="quizPrompt">{question.prompt}</div>
                      <div className="quizChoices">
                        {question.choices.map((choice: string, index: number) => (
                          <button
                            key={`${question.id}-${index}`}
                            className={quizAnswers[question.id] === index ? "quizChoice quizChoiceSelected" : "quizChoice"}
                            onClick={() => setQuizAnswers((current) => ({ ...current, [question.id]: index }))}
                            type="button"
                          >
                            <span className="quizChoiceText">{choice}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="quizActions">
                    <span className="badge badge-gray">{quizSession.generator}</span>
                    <button className="assistantSendButton quizSubmitButton" disabled={quizLoading} onClick={() => void submitQuiz()} type="button">
                      {quizLoading ? copy.quiz.submitting : copy.quiz.submit}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
