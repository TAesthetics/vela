/**
 * Native shell helpers (iOS / Android via Capacitor, see capacitor.config.ts).
 *
 * The store apps load this same web app from the server; Capacitor injects
 * `window.Capacitor` into the page. Everything here is a no-op in a normal
 * browser, and the plugin code is only imported inside the native app.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** The deep link the system browser returns to after login (see scripts/native-setup.mjs). */
export const NATIVE_AUTH_SCHEME = "vela://auth";

let started = false;

/** Status bar, splash, Android back button and the login deep link. Call once on mount. */
export async function initNativeShell(onAuthUrl: (url: string) => void): Promise<void> {
  if (!isNativeApp() || started) return;
  started = true;
  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/splash-screen"),
    import("@capacitor/status-bar"),
  ]);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: "#12100e" }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);

  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
  await App.addListener("appUrlOpen", ({ url }) => {
    if (url.startsWith(NATIVE_AUTH_SCHEME)) onAuthUrl(url);
  });
  // Cold start straight from the deep link (the OS killed the app meanwhile).
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url?.startsWith(NATIVE_AUTH_SCHEME)) onAuthUrl(launch.url);
}

/** Haptic feedback in the native app; silently nothing on the web. */
export async function nativeHaptic(kind: "match" | "tap"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "match") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics unavailable */
  }
}

/**
 * Push notifications are prepared but not switched on: they need a Firebase
 * project (Android) and the Push capability + APNs key (iOS). See docs/STORE.md
 * ("Push später"). Kept as the single place to wire them up.
 */
export const pushNotificationsEnabled = false;
