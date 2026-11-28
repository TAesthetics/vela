import { useEffect, useMemo, useState } from "react";
import { PrimaryButton } from "@/components/vela/ui";
import { openLegalPage } from "@/lib/native";
import { useVela } from "@/lib/vela/store";
import type { StoreSdk } from "@/lib/vela/in-app-purchase";
import { buyPlus, loadPlusOffer, restorePlus, type PlusOffer } from "@/lib/vela/in-app-store";

function storeName(): string {
  if (typeof window === "undefined") return "den Store";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === "android" ? "Google Play" : "den App Store";
}

/**
 * VELA+ purchase in the iOS/Android app (App Store / Google Play via
 * RevenueCat). Shown only when canBuyInApp(): price and period come from the
 * store itself, and Apple 3.1.2 wants title, length, price, auto-renewal,
 * restore and links to terms and privacy right here.
 */
export function InAppPlus({ sdk: current }: { sdk: StoreSdk }) {
  // The snapshot is replaced on every sync; only reload the offer when the keys or the account change.
  const sdk = useMemo(
    () => ({ ios: current.ios, android: current.android, appUserId: current.appUserId }),
    [current.ios, current.android, current.appUserId],
  );
  const confirmStorePlus = useVela((state) => state.confirmStorePlus);
  const [offer, setOffer] = useState<PlusOffer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "busy">("loading");
  const [note, setNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const store = storeName();

  useEffect(() => {
    let alive = true;
    setState("loading");
    loadPlusOffer(sdk)
      .then((next) => {
        if (!alive) return;
        setOffer(next);
        setState(next ? "ready" : "missing");
      })
      .catch(() => {
        if (alive) setState("missing");
      });
    return () => {
      alive = false;
    };
  }, [sdk, attempt]);

  async function buy() {
    if (!offer) return;
    setState("busy");
    setNote(null);
    const result = await buyPlus(sdk, offer);
    // The server's answer after "bought" shows as a toast.
    if (result === "bought") await confirmStorePlus();
    else if (result !== "cancelled") {
      setNote(result);
    }
    setState("ready");
  }

  async function restore() {
    setState("busy");
    setNote(null);
    const error = await restorePlus(sdk);
    if (error) setNote(error);
    else await confirmStorePlus();
    setState(offer ? "ready" : "missing");
  }

  const busy = state === "busy";
  return (
    <div className="grid gap-3">
      {state === "loading" ? (
        <p className="rounded-full bg-surface px-4 py-3 text-center text-sm text-muted">Lädt Preis aus {store} …</p>
      ) : state === "missing" ? (
        <>
          <p className="rounded-2xl bg-surface px-4 py-3 text-center text-sm text-muted">
            {store === "Google Play" ? "Google Play" : "Der App Store"} antwortet gerade nicht.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="h-11 text-sm text-paper underline-offset-4 hover:underline"
          >
            Nochmal versuchen
          </button>
        </>
      ) : offer ? (
        <>
          <p className="font-display text-4xl text-paper tabular-nums">
            {offer.price}{" "}
            <span className="font-sans text-base text-muted">/ {offer.period ?? "Abo-Zeitraum"}</span>
          </p>
          <PrimaryButton disabled={busy} onClick={() => void buy()}>
            {busy ? "Einen Moment …" : `Vela+ holen · ${offer.price}`}
          </PrimaryButton>
        </>
      ) : null}
      {note && (
        <p role="status" className="text-center text-sm text-paper">
          {note}
        </p>
      )}
      <p className="text-xs text-muted">
        Vela+ ({offer?.period ? `1 ${offer.period}` : "monatlich"}) wird über {store} bezahlt und verlängert sich
        automatisch, wenn du es nicht mindestens 24 Stunden vor Ende des Zeitraums kündigst. Kündigen und verwalten geht
        in den Abo-Einstellungen von {store}.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <button type="button" disabled={busy} onClick={() => void restore()} className="h-11 text-paper underline-offset-4 hover:underline disabled:opacity-50">
          Käufe wiederherstellen
        </button>
        <button type="button" onClick={() => void openLegalPage("/agb")} className="h-11 underline-offset-4 hover:underline">
          AGB
        </button>
        <button type="button" onClick={() => void openLegalPage("/datenschutz")} className="h-11 underline-offset-4 hover:underline">
          Datenschutz
        </button>
      </div>
    </div>
  );
}
