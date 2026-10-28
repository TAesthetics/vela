export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/**
 * Workspace preview vs deployed app. The deployer writes GROK_PROJECT_ID on
 * every publish; the sandbox preview never has it. Single source of truth for
 * the split — gate audience, gate endpoints and connector-token semantics all
 * key off this predicate.
 */
export function isWorkspacePreview(): boolean {
  return !env("GROK_PROJECT_ID") && !isSelfHosted();
}

/**
 * Self-hosted deployment outside the Grok platform (own Vercel project, Railway).
 * Railway sets RAILWAY_ENVIRONMENT_NAME on every service; VELA_SELF_HOSTED=1
 * forces it elsewhere (own Vercel project, see docs/VERCEL.md). Self-hosted apps use their own Google/X OAuth credentials instead
 * of the Grok auth broker (see `auth/server.ts` and docs/RAILWAY.md).
 */
export function isSelfHosted(): boolean {
  return Boolean(
    env("RAILWAY_ENVIRONMENT_NAME") || env("RAILWAY_ENVIRONMENT") || env("VELA_SELF_HOSTED"),
  );
}

/**
 * Public https origin of a self-hosted app: BETTER_AUTH_URL, else the domain
 * Railway or Vercel generated for production.
 */
export function selfHostedPublicUrl(): string | undefined {
  const explicit = env("BETTER_AUTH_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = env("RAILWAY_PUBLIC_DOMAIN") || env("VERCEL_PROJECT_PRODUCTION_URL");
  return host ? `https://${host}` : undefined;
}
