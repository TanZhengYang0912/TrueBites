import { useEffect, useRef, useState } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(document.activeElement);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const isBusy = busy || submitting;

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!isBusy && !inFlight.current) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isBusy, onCancel]);

  async function confirm() {
    if (isBusy || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function cancel() {
    if (!isBusy && !inFlight.current) onCancel();
  }

  return (
    <div className="admin-modal-backdrop" onClick={cancel}>
      <div
        ref={dialogRef}
        className="admin-modal-card admin-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="admin-modal-form">
          <p className="admin-confirm-message">{message}</p>
          <div className="admin-modal-actions">
            <button ref={cancelRef} type="button" className="admin-secondary-btn compact" onClick={cancel} disabled={isBusy}>
              Cancel
            </button>
            <button type="button" className={`admin-primary-btn compact${tone === "danger" ? " danger" : ""}`} onClick={confirm} disabled={isBusy}>
              {isBusy ? "…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
