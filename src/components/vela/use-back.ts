import { useEffect, useLayoutEffect, useRef } from "react";
import { handleBack, registerBack, type BackLayer } from "@/lib/vela/back-stack";

let escapeListening = false;

/** One window listener for the whole app: Escape closes the top dialog. */
function listenForEscape() {
  if (escapeListening || typeof window === "undefined") return;
  escapeListening = true;
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    if (handleBack("escape")) event.preventDefault();
  });
}

/**
 * While `active`, the Android back button (and Escape, for dialogs) runs
 * `run` instead of closing the app. See src/lib/vela/back-stack.ts.
 */
export function useBack(active: boolean, layer: BackLayer, run: () => void) {
  const latest = useRef(run);
  useLayoutEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!active) return;
    listenForEscape();
    return registerBack(layer, () => latest.current());
  }, [active, layer]);
}

/**
 * Focus for a dialog or sheet: moves focus into it when it opens (so screen
 * readers and keyboards start there) and back to where it was when it closes.
 */
export function useDialogFocus<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [active]);
  return ref;
}
