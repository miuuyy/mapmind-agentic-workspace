import React from "react";

export function ConfirmDialog({
  open,
  modalRef,
  cancelButtonRef,
  titleId,
  descriptionId,
  title,
  body,
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  cancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  titleId: string;
  descriptionId: string;
  title: string;
  body: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div className="quizOverlay confirmOverlay">
      <div
        ref={modalRef}
        className="quizModal confirmModal"
        style={{ maxWidth: 400 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id={titleId} className="cardTitle">{title}</div>
            <div id={descriptionId} className="mutedSmall">{body}</div>
          </div>
          <button className="modalCloseButton" onClick={onCancel} type="button">✕</button>
        </div>
        <div className="quizModalBody stack">
          <p style={{ margin: "0 0 6px", color: "var(--text-secondary)" }}>{message}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button ref={cancelButtonRef} className="btn btnGhost" onClick={onCancel} type="button">{cancelLabel}</button>
            <button className="btn btnDanger" type="button" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
