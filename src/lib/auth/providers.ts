/**
 * The upstream identity providers this app offers for sign-in (via the broker).
 *
 * Source of truth for BOTH the server (`server.ts`, one `genericOAuth` provider
 * per entry) and the client (`client.ts` / sign-in buttons). Kept in its own
 * dependency-free module so the client can import it without pulling the
 * server-only Better Auth instance (and `pg`) into the browser bundle.
 *
 * Each app federates to the shared **auth broker** (`GROK_AUTH_ISSUER`), which
 * holds the real Google/X secrets. The app never sees them — it only knows its
 * own per-app client id/secret and which upstream to ask the broker for (`idp`).
 *
 * To add an upstream (e.g. GitHub) once the broker supports it: add one entry
 * here (`{ providerId: "grok-github", idp: "github", label: "GitHub" }`). The
 * `providerId` is this app's local id and the OAuth callback path segment
 * (`/api/auth/oauth2/callback/<providerId>`); `idp` is the hint the broker reads
 * to pick the upstream (Better Auth's id for X is still `twitter`).
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Upstream hint the broker forwards to (Better Auth social id). */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

const ALL_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
];

/**
 * Optional build-time filter for the sign-in buttons, e.g. `VITE_AUTH_PROVIDERS=google`
 * on a self-hosted deploy that only has Google credentials ("google", "x").
 * Unset = all providers (the Grok platform default).
 */
const wanted = String(import.meta.env?.VITE_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

/**
 * Self-hosted VELA (own Vercel project / Railway) has no broker: sign-in is
 * e-mail + password only, so no provider buttons at all (whatever
 * VITE_AUTH_PROVIDERS says). Baked in at build time by `vite.config.ts`.
 */
const selfHostedBuild =
  typeof import.meta.env !== "undefined" && import.meta.env.VITE_VELA_SELF_HOSTED === "1";

export const GROK_PROVIDERS: readonly GrokProvider[] = selfHostedBuild
  ? []
  : wanted.length
  ? ALL_PROVIDERS.filter((p) => wanted.includes(p.providerId.replace(/^grok-/, "")))
  : ALL_PROVIDERS;
