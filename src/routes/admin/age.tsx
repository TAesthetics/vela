import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  createPasswordResetLink,
  decideIdCheck,
  liftRuleBan,
  loadAdmin,
  resolveReport,
  type AdminData,
  type AdminResetLink,
} from "@/lib/vela/admin-api";
import { REPORT_REASONS } from "@/lib/vela/data";

export const Route = createFileRoute("/admin/age")({
  head: () => ({ meta: [{ title: "Altersprüfung – Vela Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminAge,
});

function reasonLabel(id: string) {
  return REPORT_REASONS.find((reason) => reason.id === id)?.label ?? id;
}

function when(isoDate: string) {
  return isoDate ? new Date(isoDate).toLocaleString("de-AT") : "";
}

function AdminAge() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await loadAdmin());
    } catch {
      setError("Nicht angemeldet oder kein Zugriff.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(run: () => Promise<AdminData>) {
    if (busy) return;
    setBusy(true);
    try {
      setData(await run());
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Shell><p className="text-muted">{error}</p></Shell>;
  if (!data) return <Shell><p className="text-muted">Lädt…</p></Shell>;
  if (!data.allowed) {
    return (
      <Shell>
        <p className="text-muted">Kein Zugriff. Nur E-Mail-Adressen aus ADMIN_EMAILS dürfen diese Seite sehen.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="mt-8 font-display text-2xl">Ausweisprüfungen ({data.checks.length})</h2>
      <p className="mt-1 text-xs text-muted">
        Nur Geburtsdatum prüfen. Das Bild wird bei Entscheidung sofort gelöscht, sonst nach 30 Tagen.
      </p>
      <div className="mt-4 grid gap-4">
        {data.checks.length === 0 && <p className="text-sm text-muted">Keine offenen Prüfungen.</p>}
        {data.checks.map((check) => (
          <div key={check.id} className="rounded-2xl border border-line p-4">
            <p className="text-sm">
              {check.name ?? "(ohne Profil)"} · angegeben {check.age ?? "?"} · {when(check.createdAt)}
            </p>
            {check.signals.length > 0 && (
              <p className="mt-1 text-xs text-muted">Hinweise: {check.signals.join(" · ")}</p>
            )}
            {check.image && (
              <img src={check.image} alt="Ausweis" className="mt-3 max-h-96 w-full rounded-xl object-contain" />
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => decideIdCheck({ data: { id: check.id, approve: true } }))}
                className="h-11 flex-1 rounded-full bg-ember text-sm font-medium text-ink"
              >
                18+ bestätigt – entsperren
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => decideIdCheck({ data: { id: check.id, approve: false } }))}
                className="h-11 flex-1 rounded-full border border-line text-sm"
              >
                Ablehnen – bleibt gesperrt
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-2xl">Offene Meldungen ({data.reports.length})</h2>
      <div className="mt-4 grid gap-3">
        {data.reports.length === 0 && <p className="text-sm text-muted">Keine offenen Meldungen.</p>}
        {data.reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-line p-4">
            <p className="text-sm">
              <span className={report.reason === "minor" ? "text-ember" : ""}>{reasonLabel(report.reason)}</span> ·{" "}
              {report.name ?? report.toUser} · {report.status ?? "kein Profil"} · {when(report.createdAt)}
            </p>
            {report.details && <p className="mt-1 text-sm text-muted">„{report.details}“</p>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => resolveReport({ data: { id: report.id, suspend: true } }))}
                className="h-10 flex-1 rounded-full border border-ember text-sm text-ember"
              >
                Sperren (Alter)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`${report.name ?? "Diese Person"} wegen Regelverstoß sperren? Kein Ausweis-Weg, nur du kannst die Sperre aufheben.`)) {
                    void act(() => resolveReport({ data: { id: report.id, ban: true } }));
                  }
                }}
                className="h-10 flex-1 rounded-full border border-ember text-sm text-ember"
              >
                Sperren (Regelverstoß)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => resolveReport({ data: { id: report.id, suspend: false } }))}
                className="h-10 flex-1 rounded-full border border-line text-sm"
              >
                Erledigt
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-2xl">Gesperrt wegen Regelverstoß ({data.banned.length})</h2>
      <ul className="mt-4 grid gap-2 text-sm">
        {data.banned.length === 0 && <li className="text-muted">Niemand.</li>}
        {data.banned.map((person) => (
          <li key={person.userId} className="flex items-center gap-3 rounded-xl bg-surface p-3">
            <span className="flex-1">
              {person.name ?? person.userId} · seit {when(person.since)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Sperre für ${person.name ?? "diese Person"} aufheben?`)) {
                  void act(() => liftRuleBan({ data: { userId: person.userId } }));
                }
              }}
              className="h-9 rounded-full border border-line px-4 text-xs"
            >
              Aufheben
            </button>
          </li>
        ))}
      </ul>

      <ResetLinkTool />

      <h2 className="mt-10 font-display text-2xl">Alters-Hinweise (letzte 50)</h2>
      <ul className="mt-4 grid gap-2 text-sm">
        {data.flags.map((flag) => (
          <li key={flag.id} className="rounded-xl bg-surface p-3">
            {flag.name ?? flag.userId} · {flag.source} · {flag.action}
            {" · "}{when(flag.createdAt)}
            {flag.signals.length > 0 && <span className="block text-xs text-muted">{flag.signals.join(" · ")}</span>}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 font-display text-2xl">App-Fehler (letzte 30 Tage)</h2>
      <p className="mt-1 text-xs text-muted">
        Anonyme Absturzberichte aus Web und App, gruppiert. Ohne Nutzer-ID oder IP; Löschung 30 Tage nach dem letzten Auftreten.
      </p>
      <ul className="mt-4 grid gap-2 text-sm">
        {data.errors.length === 0 && <li className="text-muted">Keine Fehler gemeldet.</li>}
        {data.errors.map((err) => (
          <li key={err.fingerprint} className="rounded-xl bg-surface p-3">
            <span className="break-words">{err.message}</span>
            <span className="block text-xs text-muted">
              {err.count}× · {err.platform} · {err.path || "/"}
              {err.release ? ` · ${err.release}` : ""} · zuletzt {when(err.lastSeen)}
            </span>
            {err.stack && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted">Stack</summary>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted">{err.stack}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function ResetLinkTool() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminResetLink | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCopied(false);
    try {
      setResult(await createPasswordResetLink({ data: { email } }));
    } catch {
      setResult({ ok: false, error: "Hat nicht geklappt. Bitte nochmal versuchen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="mt-10 font-display text-2xl">Passwort zurücksetzen</h2>
      <p className="mt-1 text-xs text-muted">
        Nur wenn die Anfrage von genau dieser Konto-Adresse kam. Der Link gilt 24 Stunden und nur einmal; schick ihn
        als Antwort auf diese Mail. Alte Links derselben Person werden ungültig.
      </p>
      <form onSubmit={create} className="mt-4 flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-Mail des Kontos"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm"
        />
        <button type="submit" disabled={busy || !email.trim()} className="h-10 rounded-full border border-line px-4 text-xs disabled:opacity-50">
          {busy ? "…" : "Link erstellen"}
        </button>
      </form>
      {result && !result.ok && <p className="mt-2 text-sm text-ember">{result.error}</p>}
      {result?.ok && (
        <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
          <span className="block break-all font-mono text-xs">{result.link}</span>
          <span className="mt-1 block text-xs text-muted">Gültig bis {when(result.expiresAt)}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(result.link).then(() => setCopied(true));
            }}
            className="mt-2 h-9 rounded-full border border-line px-4 text-xs"
          >
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl bg-bg px-6 py-10 text-paper">
      <h1 className="font-display text-3xl">Vela · Altersprüfung</h1>
      {children}
    </main>
  );
}
