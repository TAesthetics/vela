import { create } from "zustand";
import { deleteProfile, loadVela, saveProfile, sendMessage, setPlus, swipe, undoPass } from "@/lib/vela/api";
import { emptySnapshot, type Me, type Person, type Snapshot, type Thread } from "@/lib/vela/data";

export type SparkResult = "match" | "sent" | "ok" | "limit" | "skip";

type VelaStore = {
  ready: boolean;
  me: Me | null;
  plus: boolean;
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
  save: (me: Me) => Promise<string | null>;
  pass: (id: string) => Promise<SparkResult>;
  undo: () => Promise<boolean>;
  spark: (personId: string, promptId: string, note: string) => Promise<SparkResult>;
  send: (personId: string, text: string) => Promise<void>;
  unlockPlus: () => Promise<void>;
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

function apply(snapshot: Snapshot, extra?: Partial<VelaStore>) {
  return {
    me: snapshot.me,
    plus: snapshot.plus,
    swipesLeft: snapshot.swipesLeft,
    lastPassId: snapshot.lastPassId,
    others: snapshot.others,
    deck: snapshot.deck,
    inbound: snapshot.inbound,
    inboundCount: snapshot.inboundCount,
    threads: snapshot.threads,
    ready: true,
    ...extra,
  };
}

export const useVela = create<VelaStore>((set, get) => ({
  ready: false,
  ...emptySnapshot(),
  frontId: null,
  seen: {},
  seenCoach: false,
  celebrate: null,
  toast: null,
  load: async () => {
    const snapshot = await loadVela();
    const coach = typeof localStorage !== "undefined" && localStorage.getItem("vela-coach") === "1";
    set({ ...apply(snapshot), seen: readSeen(), seenCoach: coach });
  },
  save: async (me) => {
    const result = await saveProfile({ data: me });
    if (result.error || !result.snapshot) return result.error ?? "Speichern ging schief.";
    set(apply(result.snapshot));
    return null;
  },
  pass: async (id) => {
    const result = await swipe({ data: { toUser: id, direction: "pass" } });
    set(apply(result.snapshot, { frontId: null }));
    return result.status;
  },
  undo: async () => {
    const result = await undoPass();
    set(apply(result.snapshot, { frontId: result.id }));
    return result.ok;
  },
  spark: async (personId, promptId, note) => {
    const result = await swipe({ data: { toUser: personId, direction: "spark", promptId, note } });
    const person = result.snapshot.threads.find((thread) => thread.person.id === personId)?.person;
    set(
      apply(result.snapshot, {
        frontId: null,
        celebrate: result.status === "match" && person ? person : get().celebrate,
        toast:
          result.status === "sent"
            ? "Funk ist raus. Wenn es klingt, meldet sich die Person."
            : result.status === "limit"
              ? "Heute sind die Swipes alle."
              : get().toast,
      }),
    );
    return result.status;
  },
  send: async (personId, text) => {
    const result = await sendMessage({ data: { toUser: personId, text } });
    set(apply(result.snapshot, { toast: result.error }));
  },
  unlockPlus: async () => {
    const snapshot = await setPlus();
    set(apply(snapshot, { toast: snapshot.plus ? "Vela+ ist an." : "Leg zuerst dein Profil an." }));
  },
  removeProfile: async () => {
    const snapshot = await deleteProfile();
    set(apply(snapshot, { celebrate: null, toast: null, frontId: null }));
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
