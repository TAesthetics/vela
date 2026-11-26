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
  /** Ticked "Ich bin mindestens 18 Jahre alt" (stored server-side with a timestamp). */
  adultConfirmed: boolean;
  /** Accepted the AGB incl. the community rules (Apple 1.2), stored server-side with a timestamp. */
  termsAccepted: boolean;
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
  /** Null while veiled; on a background poll also null when unchanged (see photoKey). */
  photo: string | null;
  /** md5 fingerprint of the unveiled photo, null while veiled or without photo. */
  photoKey: string | null;
  unveiled: boolean;
  /** Chat messages (notes excluded) each side has sent in this match. */
  mineCount: number;
  theirCount: number;
  messages: Message[];
  /**
   * Index of messages[0] in the whole conversation. 0 = from the first
   * message. > 0 either on a background poll ("only the messages after the
   * first messagesFrom ones you already have") or because long chats send only
   * their last CHAT_HISTORY_LIMIT messages (older ones stay on the server).
   */
  messagesFrom?: number;
};

export type IdCheckStatus = "none" | "pending" | "approved" | "rejected" | "expired";

/** Set when the signed-in person is suspended for a suspected age < 18. */
export type Suspension = { reason: "age" | "ban"; idCheck: IdCheckStatus };

/** VELA+ subscription state (Stripe on the web, App Store / Google Play in the apps). */
export type Billing = {
  /** False while STRIPE_SECRET_KEY is missing: "Zahlungen sind noch nicht eingerichtet". */
  configured: boolean;
  /** True once Stripe knows this person (then "Abo verwalten" works). */
  customer: boolean;
  status: string | null;
  /** Epoch ms of the end of the paid period. */
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** Set while VELA+ bought in the iOS/Android app is active (managed in that store). */
  store?: "app_store" | "play_store" | null;
  /** Epoch ms when that in-app purchase runs out (renews before, unless cancelled). */
  storeUntil?: number | null;
};

export const PLUS_PRICE_LABEL = "10 €";

export type Snapshot = {
  me: Me | null;
  suspension: Suspension | null;
  plus: boolean;
  /** Free unlock button, only in the workspace preview (no payment there). */
  plusAvailable: boolean;
  billing: Billing;
  swipesLeft: number | null;
  lastPassId: string | null;
  others: number;
  deck: Person[];
  inbound: Person[];
  inboundCount: number;
  threads: Thread[];
};

export const FREE_SWIPES = 12;

/**
 * Hard ceiling on swipes per person, also for VELA+ (which has no daily
 * allowance). Far above human use, but stops scripts that mass-spark or
 * scrape the deck.
 */
export const SWIPE_CAPS = { perMinute: 60, perDay: 1000 };

export function swipeCapHit(lastMinute: number, today: number): boolean {
  return lastMinute >= SWIPE_CAPS.perMinute || today >= SWIPE_CAPS.perDay;
}

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

// Resonanz is a fixed, public formula (no AI, no hidden ranking):
// 48 base + 14 per shared value + 26 for the same orbit (otherwise 6), clamped to 46–96.
export const RESONANCE = { base: 48, perValue: 14, sameOrbit: 26, otherOrbit: 6, min: 46, max: 96 } as const;

export function resonanceParts(me: { orbit: Orbit; values: string[] }, person: { orbit: Orbit; values: string[] }) {
  const sharedValues = person.values.filter((value) => me.values.includes(value));
  const sameOrbit = me.orbit === person.orbit;
  const raw = RESONANCE.base + sharedValues.length * RESONANCE.perValue + (sameOrbit ? RESONANCE.sameOrbit : RESONANCE.otherOrbit);
  return { sharedValues, sameOrbit, raw, score: Math.max(RESONANCE.min, Math.min(RESONANCE.max, raw)) };
}

export function resonance(me: { orbit: Orbit; values: string[] }, person: { orbit: Orbit; values: string[] }) {
  return resonanceParts(me, person).score;
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
    adultConfirmed: false,
    termsAccepted: false,
  };
}

export function emptySnapshot(): Snapshot {
  return {
    me: null,
    suspension: null,
    plus: false,
    plusAvailable: false,
    billing: { configured: false, customer: false, status: null, periodEnd: null, cancelAtPeriodEnd: false },
    swipesLeft: FREE_SWIPES,
    lastPassId: null,
    others: 0,
    deck: [],
    inbound: [],
    inboundCount: 0,
    threads: [],
  };
}

/**
 * Most messages sent per match in one answer: a long chat sends only its last
 * ones, so opening the app doesn't load every conversation from the very first
 * message (up to 600 messages a day each). The veil counts stay exact (counted
 * over the whole chat on the server).
 */
export const CHAT_HISTORY_LIMIT = 300;

/** How many messages the whole conversation had up to the last one held. */
export function messageTotal(thread: Pick<Thread, "messages" | "messagesFrom">): number {
  return (thread.messagesFrom ?? 0) + thread.messages.length;
}

/**
 * An answer may send only the tail of a conversation (messagesFrom > 0): put
 * the messages the client already had in front of it. messagesFrom stays the
 * index of the first message held, so the next poll can say exactly how many
 * it has. If the local copy ends before the tail starts (a gap), the server's
 * tail replaces it, so a chat never shows with messages missing in between.
 */
export function mergeMessages(incoming: Thread, old: Thread | undefined): Thread {
  const from = incoming.messagesFrom ?? 0;
  if (from <= 0) return { ...incoming, messagesFrom: 0 };
  if (!old) return incoming;
  const base = old.messagesFrom ?? 0;
  if (from <= base || from > base + old.messages.length) return incoming;
  return { ...incoming, messages: [...old.messages.slice(0, from - base), ...incoming.messages], messagesFrom: base };
}

/** Messages per "Ältere Nachrichten laden" tap. */
export const OLDER_PAGE_SIZE = 100;

/** Where the page before the first held message starts (0-based position). */
export function olderPageStart(messagesFrom: number): number {
  return Math.max(0, messagesFrom - OLDER_PAGE_SIZE);
}

/**
 * Puts a page of older messages (positions from .. from + length - 1) in front
 * of the ones the app holds. It must reach the first held message: an overlap
 * is trimmed, and a page that would leave a gap or repeat a message already
 * held (the chat was reloaded meanwhile) is ignored, so the positions behind
 * unread dots and polling stay exact.
 */
export function prependOlder(thread: Thread, page: { from: number; messages: Message[] }): Thread {
  const base = thread.messagesFrom ?? 0;
  if (base <= 0 || page.from < 0 || page.from >= base) return thread;
  if (page.from + page.messages.length < base) return thread;
  const held = new Set(thread.messages.map((message) => message.id));
  const older = page.messages.slice(0, base - page.from);
  if (older.some((message) => held.has(message.id))) return thread;
  return { ...thread, messages: [...older, ...thread.messages], messagesFrom: page.from };
}

/**
 * A full answer (app start, pull-to-refresh, saving the profile, ID upload,
 * VELA+) sends each long chat as its latest CHAT_HISTORY_LIMIT messages only.
 * Keeps the older messages the app already loaded ("Ältere Nachrichten laden")
 * in front of that window, but only when both copies agree: the held copy
 * starts earlier, reaches into the fresh window, every message they share has
 * the same id at the same position, and the held copy doesn't run past the
 * fresh end. Anything else (chat changed on the server, a gap) takes the fresh
 * window as is, so a chat never shows duplicates, gaps or shifted positions.
 */
export function keepOlderMessages(fresh: Thread, held: Thread | undefined): Thread {
  const from = fresh.messagesFrom ?? 0;
  if (!held || from <= 0 || fresh.messages.length === 0) return fresh;
  const base = held.messagesFrom ?? 0;
  const heldEnd = base + held.messages.length;
  const freshEnd = from + fresh.messages.length;
  if (base >= from || heldEnd <= from || heldEnd > freshEnd) return fresh;
  for (let position = from; position < heldEnd; position += 1) {
    if (held.messages[position - base].id !== fresh.messages[position - from].id) return fresh;
  }
  return { ...fresh, messages: [...held.messages.slice(0, from - base), ...fresh.messages], messagesFrom: base };
}

/**
 * Both ticks a new profile needs before it is saved: 18+ and the AGB with the
 * community rules (no tolerance for abuse, Apple 1.2). Checked in onboarding
 * and again on the server (saveProfile), which stores the time of each.
 */
export function consentProblem(me: { adultConfirmed?: unknown; termsAccepted?: unknown }): string | null {
  if (me.adultConfirmed !== true) return "Bitte bestätige, dass du mindestens 18 Jahre alt bist.";
  if (me.termsAccepted !== true) return "Bitte akzeptiere die AGB und die Regeln von Vela.";
  return null;
}
