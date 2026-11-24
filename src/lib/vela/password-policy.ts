/**
 * Blocks the passwords that get guessed first. VELA has no second factor and no
 * mail service yet, so a password like "12345678" or "passwort" would fall to
 * the very first guesses of a password spray, which the per-IP and per-account
 * brakes only slow down. Checked on the server for sign-up, password change and
 * reset links (src/routes/api/auth/$.ts, password-reset.server.ts) and in the
 * forms first for a quick hint. Existing passwords keep working; the rule only
 * applies when a password is set. Purely local: nothing leaves the server.
 */

export const WEAK_PASSWORD_MESSAGE =
  "Dieses Passwort ist zu leicht zu erraten. Nimm etwas Eigenes, z. B. drei Wörter, die nur du zusammen nennst.";
export const PASSWORD_LIKE_EMAIL_MESSAGE = "Das Passwort darf nicht deine E-Mail-Adresse enthalten.";

/** Lowercase, 8+ characters (shorter ones fail the length rule anyway). */
const COMMON = new Set(
  [
    "12345678", "123456789", "1234567890", "0123456789", "87654321", "11223344", "12341234", "12121212",
    "11111111", "00000000", "88888888", "123123123", "147258369", "159753123", "1q2w3e4r", "1q2w3e4r5t",
    "q1w2e3r4", "1qaz2wsx", "zaq12wsx", "qwertzui", "qwertzuiop", "qwertyui", "qwertyuiop", "asdfghjk",
    "asdfghjkl", "yxcvbnm,", "zxcvbnm,", "password", "password1", "password12", "password123", "passw0rd",
    "passwort", "passwort1", "passwort12", "passwort123", "kennwort", "kennwort1", "geheim123", "geheimnis",
    "hallo123", "hallo1234", "hallohallo", "iloveyou", "iloveyou1", "ichliebedich", "liebe123", "schatz123",
    "sommer123", "sommer2026", "winter123", "fussball", "fußball", "fussball1", "football", "baseball",
    "sunshine", "princess", "starwars", "superman", "batman123", "pokemon1", "minecraft", "letmein1",
    "welcome1", "willkommen", "abc12345", "abcd1234", "abcdefgh", "aa123456", "a1234567", "qwer1234",
    "test1234", "testtest", "admin123", "administrator", "changeme", "trustno1", "dragon12", "monkey12",
    "master12", "shadow12", "computer", "internet", "michael1", "daniel12", "schalke04", "bayern123",
    "austria1", "österreich", "oesterreich", "vienna123", "wien1234", "dating123", "tinder123", "bumble123",
    "vela1234", "vela12345", "velavela", "vela2026", "matrix123", "lovelove", "loveyou1", "daniel123",
  ].map((p) => p.normalize("NFC")),
);

/** Words that only ever get a number tacked on: "sommer2026", "hallo12345". */
const WEAK_STEMS = new Set([
  "passwort", "password", "kennwort", "geheim", "hallo", "hello", "test", "admin", "qwertz", "qwerty", "asdf",
  "abc", "vela", "sommer", "winter", "schatz", "liebe", "love", "iloveyou", "fussball", "fußball", "football", "wien", "austria",
]);

const KEYBOARD_ROWS = ["1234567890", "qwertzuiop", "qwertyuiop", "asdfghjkl", "yxcvbnm", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz"];

/** "abcabcabc", "12121212": one short block repeated. */
function isRepeated(p: string): boolean {
  for (let size = 1; size <= 4; size++) {
    if (p.length < size * 2) break;
    const block = p.slice(0, size);
    if (block.repeat(Math.ceil(p.length / size)).slice(0, p.length) === p) return true;
  }
  return false;
}

/** The whole password is one run along a keyboard row or the alphabet, either way. */
function isRun(p: string): boolean {
  return KEYBOARD_ROWS.some((row) => {
    const reversed = [...row].reverse().join("");
    return row.includes(p) || reversed.includes(p);
  });
}

/** "24121999", "1999-12-24", "24.12.1999": a date, usually a birthday. */
function isDate(p: string): boolean {
  if (!/^[\d./-]+$/.test(p)) return false;
  const digits = p.replace(/[./-]/g, "");
  if (!/^\d{8}$/.test(digits)) return false;
  const valid = (y: number, m: number, d: number) => y >= 1900 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const n = (from: number, to: number) => Number(digits.slice(from, to));
  return valid(n(4, 8), n(2, 4), n(0, 2)) || valid(n(0, 4), n(4, 6), n(6, 8)) || valid(n(4, 8), n(0, 2), n(2, 4));
}

/**
 * German reason why this password must not be used, or null when it is fine.
 * Pass the account e-mail when known (sign-up) to also refuse passwords built
 * from it.
 */
export function weakPasswordReason(password: string, email?: string | null): string | null {
  const p = password.normalize("NFC").toLowerCase();
  if (p.length < 8) return null; // the length rule answers that
  // "Passwort123!" counts as "passwort123": a trailing symbol adds nothing.
  const core = p.replace(/[\s!?.#*_-]+$/u, "");
  if (COMMON.has(p) || COMMON.has(core)) return WEAK_PASSWORD_MESSAGE;
  if (isRepeated(p) || isRun(p) || isRun(core) || isDate(core)) return WEAK_PASSWORD_MESSAGE;
  // Common word + year or counter: "passwort2024", "hallo12345".
  const stem = core.replace(/\d+$/, "");
  if (stem !== core && (COMMON.has(stem) || WEAK_STEMS.has(stem))) return WEAK_PASSWORD_MESSAGE;

  const address = (email ?? "").trim().toLowerCase();
  if (address) {
    const local = address.split("@")[0] ?? "";
    if (p.includes(address)) return PASSWORD_LIKE_EMAIL_MESSAGE;
    // "mia.huber" → "mia.huber1" or "mia.huber2026"; short locals ("mi") are fine.
    if (local.length >= 4 && core.startsWith(local) && core.length - local.length <= 4)
      return PASSWORD_LIKE_EMAIL_MESSAGE;
  }
  return null;
}
