import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Wordmark } from "@/components/vela/ui";
import { resetPasswordWithLink } from "@/lib/vela/password-reset";

export const Route = createFileRoute("/passwort-neu")({
  head: () => ({ meta: [{ title: "Neues Passwort – Vela" }, { name: "robots", content: "noindex" }] }),
  component: NewPassword,
});

const INPUT =
  "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-paper outline-none placeholder:text-muted";

function NewPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Read the token once, then drop it from the address bar and history.
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    if (params.has("token")) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    setError(null);
    if (password.length < 8) return setError("Das Passwort braucht mindestens 8 Zeichen.");
    if (password !== repeat) return setError("Die beiden Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      const result = await resetPasswordWithLink({ data: { token, password } });
      if (result.ok) setDone(true);
      else setError(result.error);
    } catch {
      setError("Hat nicht geklappt. Bitte versuch es gleich nochmal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg px-6 py-10 text-paper">
      <Wordmark />
      <h1 className="mt-8 font-display text-3xl">Neues Passwort</h1>
      {done ? (
        <>
          <p className="mt-4 text-sm text-muted">
            Fertig. Dein Passwort ist geändert und du wurdest überall abgemeldet. Melde dich jetzt mit dem neuen
            Passwort an.
          </p>
          <a href="/login" className="mt-6 flex h-14 items-center justify-center rounded-full bg-ember text-base font-medium text-ink">
            Zur Anmeldung
          </a>
        </>
      ) : token === "" ? (
        <p className="mt-4 text-sm text-muted">Dieser Link ist unvollständig. Bitte öffne den Link aus unserer Mail nochmal.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 grid gap-3">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Neues Passwort (mind. 8 Zeichen)"
            className={INPUT}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            placeholder="Neues Passwort wiederholen"
            className={INPUT}
          />
          <button
            type="submit"
            disabled={busy || token === null}
            className="h-14 rounded-full bg-ember text-base font-medium text-ink disabled:opacity-50"
          >
            {busy ? "Einen Moment…" : "Passwort speichern"}
          </button>
          {error && (
            <p className="rounded-2xl bg-surface p-3 text-sm text-ember" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
