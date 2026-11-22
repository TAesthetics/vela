import { createFileRoute } from "@tanstack/react-router";
import { auth, authRateLimitEnabled } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { authRateLimited, signInEmailOf, withSignInAccountLimit } from "@/lib/vela/auth-guard.server";

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
        return auth.handler(request);
      },
    },
  },
});
