export type Orbit = "slow" | "adventure" | "depth" | "light" | "real";

export type Prompt = { id: string; q: string; a: string };

export type Me = {
  name: string;
  age: number;
  city: string;
  orbit: Orbit;
  values: string[];
  prompts: Prompt[];
  photo: string | null;
  onboarded: boolean;
};

export type Person = {
  id: string;
  name: string;
  age: number;
  city: string;
  orbit: Orbit;
  values: string[];
  prompts: Prompt[];
  sparkedYou: boolean;
};

export type Message = {
  id: string;
  from: "me" | "them";
  /** "note" = the line sent with a spark; it never counts toward the veil. */
  kind: "note" | "message";
  text: string;
  at: number;
};

export type Thread = {
  person: Person;
  photo: string | null;
  unveiled: boolean;
  /** Chat messages (notes excluded) each side has sent in this match. */
  mineCount: number;
  theirCount: number;
  messages: Message[];
};

export type IdCheckStatus = "none" | "pending" | "approved" | "rejected" | "expired";

/** Set when the signed-in person is suspended for a suspected age < 18. */
export type Suspension = { reason: "age"; idCheck: IdCheckStatus };

export type Snapshot = {
  me: Me | null;
  suspension: Suspension | null;
  plus: boolean;
  /** False until a real checkout exists outside the workspace preview. */
  plusAvailable: boolean;
  swipesLeft: number | null;
  lastPassId: string | null;
  others: number;
  deck: Person[];
  inbound: Person[];
  inboundCount: number;
  threads: Thread[];
};

export const FREE_SWIPES = 12;

/** Report reasons (stored id → German label). */
export const REPORT_REASONS = [
  { id: "fake", label: "Fake-Profil" },
  { id: "harassment", label: "Belästigung" },
  { id: "photos", label: "Unangemessene Fotos" },
  { id: "minor", label: "Minderjährig" },
  { id: "spam", label: "Spam/Betrug" },
  { id: "other", label: "Sonstiges" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

/** Each matched person must send this many chat messages before photos show. */
export const VEIL_AFTER = 3;

/** Both sides have written enough — the only rule that lifts the veil. */
export function isUnveiled(mineCount: number, theirCount: number) {
  return mineCount >= VEIL_AFTER && theirCount >= VEIL_AFTER;
}

export const VALUES = [
  "Neugier",
  "Ruhe",
  "Humor",
  "Mut",
  "Ehrlichkeit",
  "Wärme",
  "Klarheit",
  "Loyalität",
] as const;

export const PROMPT_BANK = [
  "Mein simples Glück",
  "Zusammen sieht das so aus",
  "Eine grüne Flagge",
  "Ich bin überzeugt, dass",
  "Nach dem dritten Date",
  "Worüber ich zu viel rede",
] as const;

export const ORBITS: { id: Orbit; label: string; line: string }[] = [
  { id: "slow", label: "Langsam", line: "Kein Tempo. Nur eine Richtung." },
  { id: "adventure", label: "Abenteuer", line: "Erst die Stadt, dann der Plan." },
  { id: "depth", label: "Tiefgang", line: "Lieber ein Gespräch als ein Funke ins Leere." },
  { id: "light", label: "Leicht", line: "Witz zuerst. Schwere darf warten." },
  { id: "real", label: "Echt", line: "Absicht, ohne Theater." },
];

export const ICEBREAKERS = [
  "Der zweite Satz hat mich erwischt.",
  "Wo spielt sich das bei dir ab?",
  "Was lässt du dabei weg?",
];

export function orbitLabel(id: Orbit) {
  return ORBITS.find((orbit) => orbit.id === id)?.label ?? id;
}

export function resonance(me: { orbit: Orbit; values: string[] }, person: { orbit: Orbit; values: string[] }) {
  const shared = person.values.filter((value) => me.values.includes(value)).length;
  const orbit = me.orbit === person.orbit ? 26 : 6;
  return Math.max(46, Math.min(96, 48 + shared * 14 + orbit));
}

export function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nextQuestion(current: string, blocked: string) {
  const start = Math.max(0, PROMPT_BANK.indexOf(current as (typeof PROMPT_BANK)[number]));
  for (let step = 1; step <= PROMPT_BANK.length; step += 1) {
    const question = PROMPT_BANK[(start + step) % PROMPT_BANK.length];
    if (question !== blocked) return question;
  }
  return current;
}

export function blankMe(): Me {
  return {
    name: "",
    age: 28,
    city: "",
    orbit: "depth",
    values: [],
    prompts: [
      { id: "p1", q: "Mein simples Glück", a: "" },
      { id: "p2", q: "Zusammen sieht das so aus", a: "" },
    ],
    photo: null,
    onboarded: false,
  };
}

export function emptySnapshot(): Snapshot {
  return {
    me: null,
    suspension: null,
    plus: false,
    plusAvailable: false,
    swipesLeft: FREE_SWIPES,
    lastPassId: null,
    others: 0,
    deck: [],
    inbound: [],
    inboundCount: 0,
    threads: [],
  };
}
