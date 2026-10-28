import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the iOS App Store and Google Play (see docs/STORE.md).
 *
 * Architecture: VELA needs its server (server functions, Better Auth, the
 * database), so the app does NOT bundle a static copy. The native shell loads
 * the deployed web app from VELA_APP_URL. `native/www` holds only the local
 * fallback page shown when the server can't be reached (offline screen).
 *
 * Set the production URL (the Railway domain, see docs/RAILWAY.md) before
 * `npm run native:setup`:
 *   VELA_APP_URL=https://vela-production-xxxx.up.railway.app npm run native:setup
 * It must be the same origin as BETTER_AUTH_URL on the server.
 */
const appUrl = process.env.VELA_APP_URL?.trim().replace(/\/+$/, "") ?? "";
if (appUrl && !/^https:\/\/[^/]+$/.test(appUrl)) {
  throw new Error(`VELA_APP_URL must be an https origin without a path, got "${appUrl}"`);
}

const config: CapacitorConfig = {
  appId: "at.vela.app",
  appName: "VELA",
  webDir: "native/www",
  backgroundColor: "#12100e",
  server: appUrl
    ? {
        url: appUrl,
        // Local page shown when the server is unreachable (offline/error).
        errorPath: "offline.html",
      }
    : undefined,
  ios: {
    contentInset: "never",
    backgroundColor: "#12100e",
  },
  android: {
    backgroundColor: "#12100e",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: "#12100e",
      showSpinner: false,
    },
    StatusBar: {
      // Light text on VELA's near-black background.
      style: "DARK",
      backgroundColor: "#12100e",
      overlaysWebView: false,
    },
  },
};

export default config;
