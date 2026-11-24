import { createFileRoute } from "@tanstack/react-router";
import { auth, authRateLimitEnabled } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { authRateLimited, signInEmailOf, weakPasswordRejected, withSignInAccountLimit } from "@/lib/vela/auth-guard.server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: async ({ request }) => {
        if (authRateLimitEnabled) {
          const limited = await authRateLimited(request, getSql);
          if (limited) return limited;
          const email = await signInEmailOf(request);
          if (email) return withSignInAccountLimit(email, getSql, () => auth.handler(request));
        }
        // Also in the preview: a guessable new password is refused everywhere.
        const weak = await weakPasswordRejected(request);
        if (weak) return weak;
        return auth.handler(request);
      },
    },
  },
});
