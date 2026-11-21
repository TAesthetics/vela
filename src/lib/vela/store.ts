import { create } from "zustand";
import {
  blockUser,
  deleteProfile,
  loadVela,
  openPlusPortal,
  reportUser,
  startPlusCheckout,
  uploadIdDocument,
  saveProfile,
  sendMessage,
  setPlus,
  swipe,
  syncVela,
  undoPass,
} from "@/lib/vela/api";
import { SIGNED_OUT_TEXT, failureText, isOffline, isUnauthorized, loadFailureText, type FailedAction } from "@/lib/vela/request-failure";
import { reportError } from "@/lib/vela/error-reporter";
import { emptySnapshot, mergeMessages, type Billing, type Me, type Person, type Snapshot, type Suspension, type Thread } from "@/lib/vela/data";

export type SparkResult = "match" | "sent" | "ok" | "limit" | "skip" | "filtered";

type VelaStore = {
  ready: boolean;
  /** The server ended this login elsewhere: polling stops, the app heads to sign-in. */
  signedOut: boolean;
  /**
   * Why the first load never arrived (offline, server down, or the login was
   * refused and signing out failed too). Replaces the loading screen with a
   * retry instead of hanging there forever. Cleared by every successful load.
   */
  loadError: string | null;
  me: Me | null;
  suspension: Suspension | null;
  plus: boolean;
  plusAvailable: boolean;
  billing: Billing;
  swipesLeft: number | null;
  lastPassId: string | null;
  others: number;
  deck: Person[];
  inbound: Person[];
  inboundCount: number;
  threads: Thread[];
  frontId: string | null;
  seen: Record<string, number>;
  seenCoach: boolean;
  celebrate: Person | null;
  toast: string | null;
  load: () => Promise<void>;
  /** Pulls new messages, sparks and matches without touching the deck or the profile. */
  sync: () => Promise<void>;
  save: (me: Me) => Promise<string | null>;
  pass: (id: string) => Promise<SparkResult>;
  undo: () => Promise<boolean>;
  spark: (personId: string, promptId: string, note: string) => Promise<SparkResult>;
  /** Resolves true when the message went out; false keeps the draft in the chat. */
  send: (personId: string, text: string) => Promise<boolean>;
  unlockPlus: () => Promise<void>;
  /** Opens Stripe Checkout (or the billing portal). Resolves with an error text, null when redirecting. */
  checkoutPlus: () => Promise<string | null>;
  managePlus: () => Promise<string | null>;
  block: (personId: string) => Promise<boolean>;
  uploadId: (image: string) => Promise<string | null>;
  report: (personId: string, reason: string, details: string) => Promise<boolean>;
  removeProfile: () => Promise<void>;
  dismissCelebrate: () => void;
  clearToast: () => void;
  markSeen: (personId: string) => void;
  dismissCoach: () => void;
  person: (id: string) => Person | undefined;
  thread: (id: string) => Thread | undefined;
};

function readSeen() {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem("vela-seen") ?? "{}") as Record<string, unknown>;
    const seen: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number") seen[key] = value;
    }
    return seen;
  } catch {
    return {};
  }
}

/**
 * The session was ended on another device (password change, "Andere Geräte
 * abmelden", account deleted): the client's session cache would keep showing
 * the app for up to 5 minutes, so sign out here the normal way (clears the
 * cookies, reloads to the sign-in screen, which repeats the notice). If the
 * sign-out request itself fails, the next refused request tries again.
 */
function endSession() {
  if (useVela.getState().signedOut) return;
  useVela.setState({ signedOut: true, toast: SIGNED_OUT_TEXT });
  void import("@/lib/auth/client")
    .then(({ signOut }) => signOut("/?error=signed_out"))
    // Usually offline: let the next attempt try again, and don't leave a phone
    // that never finished loading on the loading screen.
    .catch(() => useVela.setState({ signedOut: false, loadError: SIGNED_OUT_TEXT }));
}

/**
 * A request that failed outright (no network, server down or crashed): the
 * text to show. Real server failures still reach the crash reports.
 */
function failed(action: FailedAction, err: unknown) {
  if (isUnauthorized(err)) {
    endSession();
    return SIGNED_OUT_TEXT;
  }
  const offline = isOffline();
  if (!offline) reportError(err);
  return failureText(action, offline);
}

/** Bumped on every full snapshot apply, so a slower background sync never overwrites newer state. */
let applied = 0;

/**
 * What the app already shows, for a light server answer: fingerprints of the
 * match photos on screen (only new or changed photos come back) and, per
 * match, how many chat messages it holds and the last id (only newer ones).
 */
function pollHints(threads: Thread[]) {
  const known: Record<string, string> = {};
  const held: Record<string, string> = {};
  for (const thread of threads) {
    if (thread.photo && thread.photoKey) known[thread.person.id] = thread.photoKey;
    const last = thread.messages[thread.messages.length - 1];
    if (last) held[thread.person.id] = `${thread.messages.length}:${last.id}`;
  }
  return { known, held };
}

/** Puts a light answer together with what the app already had (see pollHints). */
function mergeThreads(incoming: Thread[], current: Thread[]): Thread[] {
  const previous = new Map(current.map((thread) => [thread.person.id, thread]));
  return incoming.map((next) => {
    const old = previous.get(next.person.id);
    let thread = mergeMessages(next, old);
    if (!thread.photo && thread.photoKey && old?.photo && old.photoKey === thread.photoKey) {
      thread = { ...thread, photo: old.photo };
    }
    return thread;
  });
}

/**
 * Fills a light answer (swipe, undo, send) back up with what the app already
 * shows: my own portrait and the photos/messages it held (see pollHints).
 */
function keepKnown(snapshot: Snapshot, state: Pick<VelaStore, "me" | "threads">): Snapshot {
  const me = snapshot.me && !snapshot.me.photo && state.me ? { ...snapshot.me, photo: state.me.photo } : snapshot.me;
  return { ...snapshot, me, threads: mergeThreads(snapshot.threads, state.threads) };
}

function apply(snapshot: Snapshot, extra?: Partial<VelaStore>) {
  applied += 1;
  return {
    me: snapshot.me,
    suspension: snapshot.suspension,
    plus: snapshot.plus,
    plusAvailable: snapshot.plusAvailable,
    billing: snapshot.billing,
    swipesLeft: snapshot.swipesLeft,
    lastPassId: snapshot.lastPassId,
    others: snapshot.others,
    deck: snapshot.deck,
    inbound: snapshot.inbound,
    inboundCount: snapshot.inboundCount,
    threads: snapshot.threads,
    ready: true,
    loadError: null,
    ...extra,
  };
}

export const useVela = create<VelaStore>((set, get) => ({
  ready: false,
  signedOut: false,
  loadError: null,
  ...emptySnapshot(),
  frontId: null,
  seen: {},
  seenCoach: false,
  celebrate: null,
  toast: null,
  load: async () => {
    let snapshot;
    try {
      snapshot = await loadVela();
    } catch (err) {
      if (isUnauthorized(err)) return endSession();
      if (!get().ready) {
        const offline = isOffline();
        if (!offline) reportError(err);
        set({ loadError: loadFailureText(offline) });
        return;
      }
      throw err;
    }
    const coach = typeof localStorage !== "undefined" && localStorage.getItem("vela-coach") === "1";
    set({ ...apply(snapshot), seen: readSeen(), seenCoach: coach });
  },
  sync: async () => {
    if (!get().ready || get().signedOut) return;
    const before = applied;
    const { known, held } = pollHints(get().threads);
    let snapshot;
    try {
      snapshot = await syncVela({ data: { known, held } });
    } catch (err) {
      if (isUnauthorized(err)) return endSession();
      throw err;
    }
    if (applied !== before) return;
    set({
      suspension: snapshot.suspension,
      plus: snapshot.plus,
      plusAvailable: snapshot.plusAvailable,
      billing: snapshot.billing,
      swipesLeft: snapshot.swipesLeft,
      inbound: snapshot.inbound,
      inboundCount: snapshot.inboundCount,
      threads: mergeThreads(snapshot.threads, get().threads),
    });
  },
  save: async (me) => {
    let result;
    try {
      result = await saveProfile({ data: me });
    } catch (err) {
      // Without this the save button stayed on "Speichert…" (onboarding too).
      return failed("save", err);
    }
    if (result.error || !result.snapshot) return result.error ?? "Speichern ging schief.";
    set(apply(result.snapshot));
    return null;
  },
  pass: async (id) => {
    let result;
    try {
      result = await swipe({ data: { toUser: id, direction: "pass", ...pollHints(get().threads) } });
    } catch (err) {
      // The card stays in the deck (nothing was stored), so it simply comes back.
      set({ toast: failed("swipe", err) });
      return "skip";
    }
    set(apply(keepKnown(result.snapshot, get()), { frontId: null }));
    return result.status;
  },
  undo: async () => {
    let result;
    try {
      result = await undoPass({ data: pollHints(get().threads) });
    } catch (err) {
      set({ toast: failed("undo", err) });
      return false;
    }
    set(apply(keepKnown(result.snapshot, get()), { frontId: result.id }));
    return result.ok;
  },
  spark: async (personId, promptId, note) => {
    let result;
    try {
      result = await swipe({ data: { toUser: personId, direction: "spark", promptId, note, ...pollHints(get().threads) } });
    } catch (err) {
      set({ toast: failed("swipe", err) });
      return "skip";
    }
    const person = result.snapshot.threads.find((thread) => thread.person.id === personId)?.person;
    if (result.status === "match") void import("@/lib/native").then(({ nativeHaptic }) => nativeHaptic("match"));
    set(
      apply(keepKnown(result.snapshot, get()), {
        frontId: null,
        celebrate: result.status === "match" && person ? person : get().celebrate,
        toast:
          result.status === "sent"
            ? "Funk ist raus. Wenn es klingt, meldet sich die Person."
            : result.status === "limit"
              ? "Heute sind die Swipes alle."
              : result.status === "filtered"
                ? "Die Notiz enthält ein Wort, das wir bei Vela nicht durchlassen. Formulier sie bitte anders."
              : get().toast,
      }),
    );
    return result.status;
  },
  send: async (personId, text) => {
    // Light answer like a poll: no own portrait, no photos or messages the app
    // already has (sending used to return every unveiled photo each time).
    try {
      const result = await sendMessage({ data: { toUser: personId, text, ...pollHints(get().threads) } });
      set(apply(keepKnown(result.snapshot, get()), { toast: result.error }));
      return !result.error;
    } catch (err) {
      // Lost connection (tunnel, lift, flight mode): say so instead of failing
      // silently; the chat puts the text back so nothing typed is lost.
      set({ toast: failed("send", err) });
      return false;
    }
  },
  unlockPlus: async () => {
    const result = await setPlus();
    const toast = result.error ?? (result.snapshot.plus ? "Vela+ ist an." : "Leg zuerst dein Profil an.");
    set(apply(result.snapshot, { toast }));
  },
  checkoutPlus: async () => {
    try {
      const result = await startPlusCheckout();
      if (result.url) {
        window.location.assign(result.url);
        return null;
      }
      set({ toast: result.error });
      return result.error;
    } catch (err) {
      const error = isUnauthorized(err) ? failed("save", err) : "Die Bezahlseite ließ sich nicht öffnen.";
      set({ toast: error });
      return error;
    }
  },
  managePlus: async () => {
    try {
      const result = await openPlusPortal();
      if (result.url) {
        window.location.assign(result.url);
        return null;
      }
      set({ toast: result.error });
      return result.error;
    } catch (err) {
      const error = isUnauthorized(err) ? failed("save", err) : "Die Abo-Verwaltung ließ sich nicht öffnen.";
      set({ toast: error });
      return error;
    }
  },
  uploadId: async (image) => {
    let result;
    try {
      result = await uploadIdDocument({ data: { image } });
    } catch (err) {
      return failed("uploadId", err);
    }
    set(apply(result.snapshot, { toast: result.error ?? "Danke. Wir prüfen deinen Ausweis." }));
    return result.error;
  },
  block: async (personId) => {
    let result;
    try {
      result = await blockUser({ data: { toUser: personId, ...pollHints(get().threads) } });
    } catch (err) {
      set({ toast: failed("block", err) });
      return false;
    }
    set(apply(keepKnown(result.snapshot, get()), { toast: result.error ?? "Blockiert. Ihr seht euch nicht mehr." }));
    return !result.error;
  },
  report: async (personId, reason, details) => {
    let result;
    try {
      result = await reportUser({ data: { toUser: personId, reason, details, ...pollHints(get().threads) } });
    } catch (err) {
      set({ toast: failed("report", err) });
      return false;
    }
    set(
      apply(keepKnown(result.snapshot, get()), {
        toast: result.error ?? "Danke. Gemeldet und blockiert.",
      }),
    );
    return !result.error;
  },
  removeProfile: async () => {
    let snapshot;
    try {
      snapshot = await deleteProfile();
    } catch (err) {
      if (isUnauthorized(err)) return endSession();
      set({ toast: err instanceof Error && err.message ? err.message : "Löschen ging gerade nicht." });
      return;
    }
    set(apply(snapshot, { celebrate: null, toast: null, frontId: null }));
    // The login is gone too (DSGVO Art. 17): drop the local session and start over.
    const { forgetLocalSession } = await import("@/lib/auth/client");
    forgetLocalSession();
    if (typeof window !== "undefined") window.location.href = "/";
  },
  dismissCelebrate: () => set({ celebrate: null }),
  clearToast: () => set({ toast: null }),
  markSeen: (personId) => {
    const thread = get().threads.find((item) => item.person.id === personId);
    if (!thread) return;
    const seen = { ...get().seen, [personId]: thread.messages.length };
    set({ seen });
    localStorage.setItem("vela-seen", JSON.stringify(seen));
  },
  dismissCoach: () => {
    localStorage.setItem("vela-coach", "1");
    set({ seenCoach: true });
  },
  person: (id) => {
    const state = get();
    return (
      state.deck.find((person) => person.id === id) ??
      state.inbound.find((person) => person.id === id) ??
      state.threads.find((thread) => thread.person.id === id)?.person
    );
  },
  thread: (id) => get().threads.find((thread) => thread.person.id === id),
}));
