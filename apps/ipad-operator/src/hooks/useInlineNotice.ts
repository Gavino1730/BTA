import { useEffect, useRef, useState } from "react";
import type { InlineNotice, NoticeTone } from "../types.js";

/**
 * Manages a single auto-dismissing inline notification banner in the operator UI.
 * Each call to `showInlineNotice` replaces any active notice and starts a fresh timer.
 */
export function useInlineNotice() {
  const [inlineNotice, setInlineNotice] = useState<InlineNotice | null>(null);
  const timerRef = useRef<number | null>(null);

  function dismissInlineNotice() {
    setInlineNotice(null);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function showInlineNotice(message: string, tone: NoticeTone = "error", timeoutMs = 7000) {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setInlineNotice({ id: Date.now(), tone, message });
    if (timeoutMs > 0) {
      timerRef.current = window.setTimeout(() => {
        setInlineNotice(null);
        timerRef.current = null;
      }, timeoutMs);
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { inlineNotice, showInlineNotice, dismissInlineNotice };
}
