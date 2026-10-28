import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Wordmark } from "@/components/vela/ui";
import { LegalLinks } from "@/components/vela/legal";

export function SignInPanel() {
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
              onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
              className="h-14 rounded-full border border-line text-base text-paper"
            >
              Weiter mit {provider.label}
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">Anmeldung ist gerade aus.</p>
        )}
      </div>
      <p className="mt-6 text-xs text-muted">
        Nur ab 18. Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.
      </p>
      <LegalLinks className="mt-3" />
    </div>
  );
}
