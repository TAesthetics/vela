import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { REPORT_REASONS, type ReportReason } from "@/lib/vela/data";
import { useVela } from "@/lib/vela/store";
import { PrimaryButton, cn } from "@/components/vela/ui";

type Step = "closed" | "menu" | "block" | "report";

/**
 * "Blockieren" / "Melden" for one person, each with a confirm step.
 * Blocking and reporting are enforced server-side (see `src/lib/vela/api.ts`);
 * afterwards the person is gone from the snapshot, so `onDone` leaves the view.
 */
export function SafetyMenu({ personId, name, onDone }: { personId: string; name: string; onDone: () => void }) {
  const block = useVela((state) => state.block);
  const report = useVela((state) => state.report);
  const [step, setStep] = useState<Step>("closed");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setStep("closed");
    setReason(null);
    setDetails("");
  }

  async function run(action: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await action();
      close();
      if (ok) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Sicherheit: ${name} blockieren oder melden`}
        onClick={() => setStep("menu")}
        className="ml-auto grid size-11 shrink-0 place-items-center text-muted"
      >
        <ShieldAlert className="size-5" />
      </button>
      {step !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-bg p-5 pb-8 text-paper"
            onClick={(event) => event.stopPropagation()}
          >
            {step === "menu" && (
              <div className="grid gap-3">
                <p className="font-display text-2xl">{name}</p>
                <button
                  type="button"
                  onClick={() => setStep("block")}
                  className="h-12 rounded-full border border-line text-base"
                >
                  Blockieren
                </button>
                <button
                  type="button"
                  onClick={() => setStep("report")}
                  className="h-12 rounded-full border border-line text-base text-ember"
                >
                  Melden
                </button>
                <button type="button" onClick={close} className="h-11 text-sm text-muted">
                  Abbrechen
                </button>
              </div>
            )}
            {step === "block" && (
              <div className="grid gap-3">
                <p className="font-display text-2xl">{name} blockieren?</p>
                <p className="text-sm text-muted">
                  Ihr seht euch nicht mehr: kein Profil, kein Funk, kein Gespräch. {name} erfährt nichts davon.
                </p>
                <PrimaryButton disabled={busy} onClick={() => void run(() => block(personId))}>
                  Ja, blockieren
                </PrimaryButton>
                <button type="button" onClick={close} className="h-11 text-sm text-muted">
                  Abbrechen
                </button>
              </div>
            )}
            {step === "report" && (
              <div className="grid gap-3">
                <p className="font-display text-2xl">{name} melden</p>
                <p className="text-sm text-muted">Was ist los? Melden blockiert {name} automatisch.</p>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_REASONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setReason(item.id)}
                      aria-pressed={reason === item.id}
                      className={cn(
                        "min-h-11 rounded-2xl border px-3 py-2 text-left text-sm",
                        reason === item.id ? "border-ember text-ember" : "border-line text-paper",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value.slice(0, 1000))}
                  placeholder="Optional: Was ist passiert?"
                  rows={3}
                  className="w-full rounded-2xl border border-line bg-surface p-3 text-sm text-paper"
                />
                <PrimaryButton
                  disabled={busy || !reason}
                  onClick={() => reason && void run(() => report(personId, reason, details))}
                >
                  Melden und blockieren
                </PrimaryButton>
                <p className="text-xs text-muted">
                  Bei Gefahr ruf den Notruf 112 bzw. die Polizei 133.
                </p>
                <button type="button" onClick={close} className="h-11 text-sm text-muted">
                  Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
