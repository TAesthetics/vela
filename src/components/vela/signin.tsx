import { useEffect, useState, type FormEvent } from "react";
import {
  GROK_PROVIDERS,
  signInWithEmail,
  signUpWithEmail,
  authEnabled,
  cancelSignIn,
  hasPendingSignIn,
  resumePendingSignIn,
  signIn,
  signInErrorMessage,
} from "@/lib/auth/client";
import { Wordmark } from "@/components/vela/ui";
import { LegalLinks } from "@/components/vela/legal";
import { OPERATOR } from "@/lib/vela/legal-info";

const INPUT =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-paper outline-none placeholder:text-muted";

export function SignInPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emailBusy) return;
    setError(null);
    if (mode === "signup") {
      if (password.length < 8) return setError("Das Passwort braucht mindestens 8 Zeichen.");
      if (!adult) return setError("Vela ist nur für Erwachsene. Bitte bestätige, dass du mindestens 18 bist.");
    }
    setEmailBusy(true);
    try {
      if (mode === "signup") await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : signInErrorMessage(null));
      setEmailBusy(false);
    }
  }

  useEffect(() => {
    // Deployed redirect flow: Better Auth returns to "/?error=<code>" on failure.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) {
      setError(signInErrorMessage(code));
      params.delete("error");
      params.delete("error_description");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    // Preview: the iframe may have reloaded while the sign-in tab was open.
    if (!hasPendingSignIn()) return;
    setBusy(true);
    resumePendingSignIn()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : signInErrorMessage(null)))
      .finally(() => setBusy(false));
  }, []);

  async function start(providerId: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(providerId, { callbackURL: "/", errorCallbackURL: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : signInErrorMessage(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <Wordmark />
      <p className="mt-8 text-xs tracking-widest text-ember">DATING, NEU GEDACHT</p>
      <h1 className="mt-4 font-display text-4xl leading-tight text-paper">
        Erst der Satz.
        <br />
        Dann das Gesicht.
      </h1>
      <p className="mt-5 text-base text-muted">
        Profile liegen in der Datenbank, nicht als Erfindung. Melde dich an, dann schreibst du deins.
      </p>
      {authEnabled ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-line p-1" role="tablist">
            {(
              [
                ["signin", "Anmelden"],
                ["signup", "Registrieren"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key);
                  setError(null);
                }}
                className={
                  mode === key
                    ? "h-10 rounded-full bg-paper text-sm font-medium text-ink"
                    : "h-10 rounded-full text-sm text-muted"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={(event) => void submitEmail(event)} className="mt-5 grid gap-3">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="E-Mail"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT}
            />
            <input
              type="password"
              name="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              maxLength={128}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "Passwort (mind. 8 Zeichen)" : "Passwort"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT}
            />
            {mode === "signup" && (
              <label className="flex items-start gap-3 text-sm text-paper">
                <input
                  type="checkbox"
                  required
                  checked={adult}
                  onChange={(event) => setAdult(event.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-ember"
                />
                <span>
                  Ich bin mindestens 18 Jahre alt.
                  <span className="block text-xs text-muted">Pflicht. Vela ist nur für Erwachsene.</span>
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={emailBusy}
              className="h-14 rounded-full bg-ember text-base font-medium text-ink disabled:opacity-50"
            >
              {emailBusy ? "Einen Moment…" : mode === "signup" ? "Konto erstellen" : "Anmelden"}
            </button>
          </form>
          {mode === "signin" && (
            <p className="mt-3 text-xs text-muted">
              Passwort vergessen? Schreib an{" "}
              <a href={`mailto:${OPERATOR.email}`} className="underline">
                {OPERATOR.email}
              </a>
              .
            </p>
          )}
          {GROK_PROVIDERS.length > 0 && (
            <div className="mt-6 grid gap-3">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  disabled={busy}
                  onClick={() => void start(provider.providerId)}
                  className="h-14 rounded-full border border-line text-base text-paper disabled:opacity-50"
                >
                  Weiter mit {provider.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-8 text-sm text-muted">Anmeldung ist gerade aus.</p>
      )}
      {busy && (
        <p className="mt-4 text-sm text-muted" role="status">
          Anmeldung läuft… Schließ sie im neuen Fenster ab und komm dann hierher zurück.{" "}
          <button type="button" onClick={cancelSignIn} className="underline">
            Abbrechen
          </button>
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-2xl bg-surface p-3 text-sm text-ember" role="alert">
          {error}
        </p>
      )}
      <p className="mt-6 text-xs text-muted">
        Nur ab 18. Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.
      </p>
      <LegalLinks className="mt-3" />
    </div>
  );
}
