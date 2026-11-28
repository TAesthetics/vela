/**
 * VELA+ in the iOS/Android app via RevenueCat's Capacitor plugin
 * (@revenuecat/purchases-capacitor, added to the app by npm run native:setup).
 *
 * Only active when the server sends public SDK keys (Billing.storeSdk) and the
 * installed app build contains the plugin; otherwise every function returns
 * null and the VELA+ screen stays as before. The plugin is imported lazily,
 * so the web app never loads it. Whether VELA+ is on is decided on the server
 * (refreshStorePlus / webhook re-read RevenueCat), never here.
 */
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { isNativeApp } from "@/lib/native";
import { pickPlusPackage, periodText, purchaseErrorText, sdkKeyFor, type StoreSdk } from "./in-app-purchase";

type CapacitorGlobal = { getPlatform?: () => string; isPluginAvailable?: (name: string) => boolean };

export type PlusOffer = {
  pkg: PurchasesPackage;
  /** Localized price from the store, e.g. "4,99 €". */
  price: string;
  /** "Monat" etc., null when the store did not say. */
  period: string | null;
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

/** Platform key when in-app purchases can work in this app build, else null. */
function usableKey(sdk: StoreSdk | null | undefined): string | null {
  if (!sdk || !isNativeApp()) return null;
  const cap = capacitor();
  try {
    // Older app builds without the plugin: keep the "noch nicht" text.
    if (!cap?.isPluginAvailable?.("Purchases")) return null;
    return sdkKeyFor(sdk, cap.getPlatform?.() ?? "");
  } catch {
    return null;
  }
}

/** True when this app build can sell VELA+ (keys from the server + plugin present). */
export function canBuyInApp(sdk: StoreSdk | null | undefined): boolean {
  return usableKey(sdk) !== null;
}

let configuredKey: string | null = null;

/** Configure once per app start, then follow account switches with logIn. */
async function purchases(sdk: StoreSdk) {
  const key = usableKey(sdk);
  if (!key) return null;
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (configuredKey !== key) {
    const { isConfigured } = await Purchases.isConfigured();
    if (!isConfigured) await Purchases.configure({ apiKey: key, appUserID: sdk.appUserId });
    configuredKey = key;
  }
  const { appUserID } = await Purchases.getAppUserID();
  // Buyer must be the VELA account, else the webhook cannot find whom to unlock.
  if (appUserID !== sdk.appUserId) await Purchases.logIn({ appUserID: sdk.appUserId });
  return Purchases;
}

/** The VELA+ package with its store price, or null (not set up / no product). Throws on SDK errors. */
export async function loadPlusOffer(sdk: StoreSdk | null | undefined): Promise<PlusOffer | null> {
  if (!sdk) return null;
  const api = await purchases(sdk);
  if (!api) return null;
  const offerings = await api.getOfferings();
  const pkg = pickPlusPackage(offerings.current);
  if (!pkg) return null;
  return { pkg, price: pkg.product.priceString, period: periodText(pkg.product.subscriptionPeriod) };
}

/**
 * Opens the store's own purchase sheet. Resolves "bought", "cancelled" or an
 * error text. After "bought" the caller asks the server to re-check.
 */
export async function buyPlus(sdk: StoreSdk, offer: PlusOffer): Promise<"bought" | "cancelled" | string> {
  try {
    const api = await purchases(sdk);
    if (!api) return "Käufe in der App sind noch nicht eingerichtet.";
    await api.purchasePackage({ aPackage: offer.pkg });
    return "bought";
  } catch (err) {
    return purchaseErrorText(err) ?? "cancelled";
  }
}

/** "Käufe wiederherstellen" (Apple requires it). Resolves null when done, else an error text. */
export async function restorePlus(sdk: StoreSdk): Promise<string | null> {
  try {
    const api = await purchases(sdk);
    if (!api) return "Käufe in der App sind noch nicht eingerichtet.";
    await api.restorePurchases();
    return null;
  } catch (err) {
    return purchaseErrorText(err) ?? "Wiederherstellen abgebrochen.";
  }
}
