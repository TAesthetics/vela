/**
 * "Zurück" for the whole app: the Android back button (native.ts) and the
 * Escape key on a computer. VELA switches screens with React state instead of
 * URLs, so without this the Android back button found no history and closed
 * the app from an open chat, an open sheet or the match screen.
 *
 * Open views register a handler. Back runs the most important one: dialogs
 * and sheets (layer "dialog") before screens (layer "screen"), and within a
 * layer the one opened last. Escape only closes dialogs, never a screen, so
 * pressing Escape while typing doesn't leave the chat.
 *
 * Plain module state, no React: safe to import anywhere, and testable.
 */
export type BackLayer = "screen" | "dialog";

type Entry = { id: number; layer: BackLayer; run: () => void };

const entries: Entry[] = [];
let nextId = 1;

/** Registers a back handler; call the returned function when the view closes. */
export function registerBack(layer: BackLayer, run: () => void): () => void {
  const entry: Entry = { id: nextId++, layer, run };
  entries.push(entry);
  return () => {
    const index = entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) entries.splice(index, 1);
  };
}

function top(onlyDialogs: boolean): Entry | undefined {
  let best: Entry | undefined;
  for (const entry of entries) {
    if (onlyDialogs && entry.layer !== "dialog") continue;
    if (!best || rank(entry) >= rank(best)) best = entry;
  }
  return best;
}

function rank(entry: Entry) {
  return entry.layer === "dialog" ? 1 : 0;
}

/**
 * Runs the top back handler. Returns false when nothing is open (the caller
 * then does the default: browser history or leaving the app).
 */
export function handleBack(source: "button" | "escape" = "button"): boolean {
  const entry = top(source === "escape");
  if (!entry) return false;
  entry.run();
  return true;
}

/** For tests: forget every handler. */
export function resetBackStack() {
  entries.length = 0;
}
