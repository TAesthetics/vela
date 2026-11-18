// Simple, transparent word filter for profile texts, spark notes and messages
// (Apple guideline 1.2: "a method for filtering objectionable material").
// No AI: a fixed list of slurs, insults and explicit terms, matched as whole
// words after normalising case, accents, leetspeak and stretched letters.
// Reports, blocking and operator review stay the main safety net.

const TERMS = [
  // German: slurs and insults
  "neger", "nigger", "kanake", "kanaken", "zigeuner", "schwuchtel", "schwuchteln",
  "fotze", "fotzen", "hure", "huren", "hurensohn", "hurensöhne", "nutte", "nutten",
  "schlampe", "schlampen", "missgeburt", "missgeburten", "spast", "spasti", "spasten",
  "mongo", "wichser", "wixer", "arschficker", "drecksjude", "judensau", "untermensch",
  "vergewaltigen", "vergewaltige", "fick dich", "fick deine", "ficken", "fickt",
  "bumsen", "blasen lassen", "schwanz lutschen", "heil hitler", "sieg heil",
  // English: slurs and explicit terms
  "nigga", "niggas", "niggers", "faggot", "faggots", "fag", "fags", "retard", "retards",
  "tranny", "trannies", "chink", "kike", "spic", "whore", "whores", "slut", "sluts",
  "cunt", "cunts", "motherfucker", "fuck you", "rape", "raping", "rapist",
  "dick pic", "dickpic", "send nudes", "blowjob", "cumshot",
  // Threats
  "ich bring dich um", "ich töte dich", "kill yourself", "kys", "bring dich um",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

// Invisible format characters (zero-width space/joiner, soft hyphen, BOM,
// bidi overrides like U+202E, Unicode tag characters, ...): Unicode "Cf".
const FORMAT_CHARS = /\p{Cf}/gu;
// Control characters except line break and tab (matching them is the point).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * Removes control characters and invisible format characters from text people
 * write (names, profile sentences, notes, messages, report details). They can
 * hide words from the filter ("hu\u200Bre") or flip how a name is shown
 * (U+202E). The zero-width joiner and tag characters stay, because emoji
 * sequences (👩‍❤️‍👨, regional flags) need them.
 */
export function stripInvisible(text: string): string {
  return text
    .replace(CONTROL_CHARS, "")
    .replace(FORMAT_CHARS, (ch) => (ch === "\u200D" || /[\u{E0020}-\u{E007F}]/u.test(ch) ? ch : ""));
}

/** Lowercase, map leetspeak, strip accents (keeping umlauts), squeeze runs of 3+ letters. */
export function normalizeForFilter(text: string): string {
  // Every invisible character goes before matching, joiners included.
  const lower = text.replace(FORMAT_CHARS, "").replace(CONTROL_CHARS, " ").toLowerCase().replace(/ß/g, "ss");
  let out = "";
  for (const ch of lower) out += LEET[ch] ?? ch;
  return out
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const PATTERNS = TERMS.map((term) => {
  const words = normalizeForFilter(term).split(" ").filter(Boolean);
  return new RegExp(`(?:^| )${words.join(" ")}(?: |$)`);
});

/** True when the text contains one of the filtered words or phrases (whole words only). */
export function isObjectionable(text: string): boolean {
  const normalized = normalizeForFilter(text);
  if (!normalized) return false;
  // Also catch spaced-out spelling like "h u r e" by joining single letters.
  const joined = normalized.replace(/\b(\p{L}) (?=\p{L}\b)/gu, "$1");
  return PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(joined));
}

export const FILTER_MESSAGE = "Das enthält ein Wort, das wir bei Vela nicht durchlassen. Formulier es bitte anders.";
