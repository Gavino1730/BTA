import { useState, useCallback } from "react";
import type { ConfirmDialogState } from "../types.js";

/**
 * Promise-based confirmation dialog for the operator UI.
 * `requestConfirm` opens the dialog and returns a promise that resolves with
 * the user's choice. The component renders the dialog UI and calls
 * `resolveConfirm(true|false)` from the button handlers.
 */
export function useConfirmDialog() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const requestConfirm = useCallback((options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        tone: options.tone ?? "default",
        resolve,
      });
    });
  }, []);

  const resolveConfirm = useCallback((result: boolean) => {
    setConfirmDialog((current) => {
      if (!current) return null;
      current.resolve(result);
      return null;
    });
  }, []);

  return { confirmDialog, requestConfirm, resolveConfirm };
}
