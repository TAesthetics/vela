import { createFileRoute } from "@tanstack/react-router";

/**
 * Login for the iOS/Android app: Google and X refuse OAuth inside embedded
 * webviews, so the app opens this route in the system browser and gets the
 * session back through the vela://auth deep link (see native-handoff.server.ts).
 */
export const Route = createFileRoute("/auth/native")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/auth/native-handoff.server")).handleNativeAuthGet(request),
      POST: async ({ request }) =>
        (await import("@/lib/auth/native-handoff.server")).handleNativeAuthClaim(request),
    },
  },
});
