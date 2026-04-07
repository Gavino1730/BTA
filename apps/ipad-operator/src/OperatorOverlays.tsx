import type { Dispatch, SetStateAction } from "react";
import type { ConfirmDialogState, InlineNotice, OperatorAlert } from "./types.js";

interface InlineNoticeProps {
  notice: InlineNotice | null;
  onDismiss: () => void;
}

export function InlineNoticeBar({ notice, onDismiss }: InlineNoticeProps) {
  if (!notice) return null;
  return (
    <div className={`inline-notice inline-notice-${notice.tone}`} role="alert" aria-live="assertive">
      <span>{notice.message}</span>
      <button className="inline-notice-close" onClick={onDismiss} aria-label="Dismiss notice">
        Dismiss
      </button>
    </div>
  );
}

interface AlertBannerProps {
  alerts: OperatorAlert[];
  dismissedIds: Set<string>;
  onDismissId: Dispatch<SetStateAction<Set<string>>>;
}

export function AlertBanner({ alerts, dismissedIds, onDismissId }: AlertBannerProps) {
  const visible = alerts.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;
  const top = visible[0];
  const isUrgent = top.priority === "urgent";
  return (
    <div
      className={`operator-alert-banner operator-alert-banner-${top.priority}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="operator-alert-content">
        <span className={`operator-alert-badge operator-alert-badge-${top.priority}`}>
          {isUrgent ? "URGENT" : "ALERT"}
        </span>
        <span className="operator-alert-message">{top.message}</span>
        {visible.length > 1 && (
          <span className="operator-alert-count">+{visible.length - 1} more</span>
        )}
      </div>
      <button
        className="operator-alert-dismiss"
        onClick={() => onDismissId((prev) => new Set([...prev, top.id]))}
        aria-label="Dismiss alert"
      >
        X
      </button>
    </div>
  );
}

interface ConfirmDialogProps {
  dialog: ConfirmDialogState | null;
  onResolve: (value: boolean) => void;
}

export function ConfirmDialogOverlay({ dialog, onResolve }: ConfirmDialogProps) {
  if (!dialog) return null;
  return (
    <div className="modal-overlay" onClick={() => onResolve(false)}>
      <div className="modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{dialog.title}</span>
        </div>
        <div className="confirm-message">{dialog.message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-cancel" onClick={() => onResolve(false)}>
            {dialog.cancelLabel}
          </button>
          <button
            className={`confirm-btn ${dialog.tone === "danger" ? "confirm-btn-danger" : "confirm-btn-primary"}`}
            onClick={() => onResolve(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
