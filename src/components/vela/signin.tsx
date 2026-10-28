import { useEffect, useState } from "react";
import {
  GROK_PROVIDERS,
  authEnabled,
  cancelSignIn,
  hasPendingSignIn,
  resumePendingSignIn,
  signIn,
  signInErrorMessage,
} from "@/lib/auth/client";
import { Wordmark } from "@/components/vela/ui";
import { LegalLinks } from "@/components/vela/legal";

export function SignInPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mt-8 grid gap-3">
        {authEnabled ? (
          GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              disabled={busy}
              onClick={() => void start(provider.providerId)}
              className="h-14 rounded-full border border-line text-base text-paper disabled:opacity-50"
            >
              Weiter mit {provider.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Anmeldung ist gerade aus.</p>
        )}
      </div>
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
