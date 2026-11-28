/**
 * Pure rules for buying VELA+ inside the iOS/Android app (App Store / Google
 * Play through RevenueCat). No Capacitor and no server imports, so it is
 * unit-tested; the SDK calls live in in-app-store.ts, the trusted part (who
 * really has VELA+) stays on the server (webhook + REST re-read).
 */

/** What the server tells the app so it can sell VELA+ in the store. */
export type StoreSdk = {
  /** RevenueCat public SDK key for iOS (appl_…), null when not set up. */
  ios: string | null;
  /** RevenueCat public SDK key for Android (goog_…), null when not set up. */
  android: string | null;
  /** RevenueCat app user id = VELA account id, so the webhook finds the account. */
  appUserId: string;
};

const IOS_KEY = /^appl_[A-Za-z0-9]{8,}$/;
const ANDROID_KEY = /^goog_[A-Za-z0-9]{8,}$/;

/**
 * The public SDK keys that may go to the app. Only keys with the public
 * prefix pass: a secret key (sk_…) pasted into the wrong variable must never
 * reach a phone. Null when neither store is set up (the app then keeps saying
 * "noch nicht", exactly as before).
 */
export function publicSdkKeys(env: { REVENUECAT_IOS_KEY?: string; REVENUECAT_ANDROID_KEY?: string }): {
  ios: string | null;
  android: string | null;
} | null {
  const ios = env.REVENUECAT_IOS_KEY?.trim() ?? "";
  const android = env.REVENUECAT_ANDROID_KEY?.trim() ?? "";
  const keys = { ios: IOS_KEY.test(ios) ? ios : null, android: ANDROID_KEY.test(android) ? android : null };
  return keys.ios || keys.android ? keys : null;
}

/** The key for the platform the app runs on, or null (web, other platform, not set up). */
export function sdkKeyFor(sdk: StoreSdk | null | undefined, platform: string): string | null {
  if (!sdk) return null;
  if (platform === "ios") return sdk.ios;
  if (platform === "android") return sdk.android;
  return null;
}

type PackageLike = { identifier: string; product: { subscriptionPeriod?: string | null } };
type OfferingLike<P extends PackageLike> = { monthly?: P | null; availablePackages: P[] };

/**
 * The package to sell: the offering's monthly package, else any monthly
 * subscription, else the first package. VELA+ is one monthly plan.
 */
export function pickPlusPackage<P extends PackageLike>(offering: OfferingLike<P> | null | undefined): P | null {
  if (!offering) return null;
  if (offering.monthly) return offering.monthly;
  const monthly = offering.availablePackages.find((pkg) => pkg.product.subscriptionPeriod === "P1M");
  return monthly ?? offering.availablePackages[0] ?? null;
}

/** ISO 8601 period of the store product (P1M, P1Y, …) in German, for "/ Monat". */
export function periodText(period: string | null | undefined): string | null {
  const match = /^P(\d+)([DWMY])$/.exec(period ?? "");
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2];
  const names: Record<string, [string, string]> = {
    D: ["Tag", "Tage"],
    W: ["Woche", "Wochen"],
    M: ["Monat", "Monate"],
    Y: ["Jahr", "Jahre"],
  };
  const [one, many] = names[unit];
  return count === 1 ? one : `${count} ${many}`;
}

// RevenueCat PURCHASES_ERROR_CODE values (strings), see @revenuecat/purchases-typescript-internal-esm.
const CANCELLED = "1";
const STORE_PROBLEM = "2";
const NOT_ALLOWED = "3";
const NOT_AVAILABLE = "5";
const ALREADY_PURCHASED = "6";
const RECEIPT_IN_USE = "7";
const NETWORK = "10";
const OTHER_SUBSCRIBER = "13";
const IN_PROGRESS = "15";
const PAYMENT_PENDING = "20";
const OFFLINE = "35";
const OTHER_USER = "40";

/** Error code of a RevenueCat SDK rejection, or null for anything else. */
function errorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  if (typeof code === "number") return String(code);
  return null;
}

/** True when the person closed the store's purchase sheet themselves (not an error). */
export function isPurchaseCancelled(err: unknown): boolean {
  if (errorCode(err) === CANCELLED) return true;
  return typeof err === "object" && err !== null && (err as { userCancelled?: unknown }).userCancelled === true;
}

/** What the app says when buying or restoring in the store fails; null = say nothing (cancelled). */
export function purchaseErrorText(err: unknown): string | null {
  if (isPurchaseCancelled(err)) return null;
  switch (errorCode(err)) {
    case PAYMENT_PENDING:
      return "Die Zahlung wartet noch auf eine Bestätigung. Vela+ startet, sobald sie durch ist.";
    case NETWORK:
    case OFFLINE:
      return "Keine Verbindung zum Store. Versuch es gleich nochmal.";
    case NOT_ALLOWED:
      return "Käufe sind auf diesem Gerät gerade nicht erlaubt (zum Beispiel durch Bildschirmzeit).";
    case NOT_AVAILABLE:
      return "Vela+ ist in diesem Store gerade nicht erhältlich.";
    case ALREADY_PURCHASED:
      return "Du hast Vela+ schon gekauft. Tipp auf „Käufe wiederherstellen“.";
    case RECEIPT_IN_USE:
    case OTHER_SUBSCRIBER:
    case OTHER_USER:
      return "Dieser Kauf gehört zu einem anderen VELA-Konto. Melde dich dort an.";
    case IN_PROGRESS:
      return "Ein Kauf läuft schon. Einen Moment.";
    case STORE_PROBLEM:
      return "Der Store antwortet gerade nicht. Versuch es gleich nochmal.";
    default:
      return "Der Kauf hat gerade nicht geklappt. Versuch es gleich nochmal.";
  }
}
