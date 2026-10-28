import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { decideIdCheck, loadAdmin, resolveReport, type AdminData } from "@/lib/vela/admin-api";
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
                onClick={() => void act(() => resolveReport({ data: { id: report.id, suspend: false } }))}
                className="h-10 flex-1 rounded-full border border-line text-sm"
              >
                Erledigt
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-2xl">Alters-Hinweise (letzte 50)</h2>
      <ul className="mt-4 grid gap-2 text-sm">
        {data.flags.map((flag) => (
          <li key={flag.id} className="rounded-xl bg-surface p-3">
            {flag.name ?? flag.userId} · {flag.source} · {flag.action}
            {flag.likelihood !== null && ` · ${Math.round(flag.likelihood * 100)} %`} · {when(flag.createdAt)}
            {flag.signals.length > 0 && <span className="block text-xs text-muted">{flag.signals.join(" · ")}</span>}
          </li>
        ))}
      </ul>
    </Shell>
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
