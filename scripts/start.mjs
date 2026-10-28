#!/usr/bin/env node
/**
 * Production start for self-hosting (Railway, any Node host): `npm start`.
 *
 * 1. Checks the required variables. If something is missing it logs exactly
 *    what, and serves a 503 page (healthcheck /healthz fails) instead of
 *    crashing — so there is no crash loop and the log says what to fix.
 * 2. Applies pending migrations to DATABASE_URL (the build can't: Railway's
 *    private database network isn't reachable during the build).
 * 3. Starts the Nitro node server (.output/server/index.mjs) on 0.0.0.0:$PORT.
 *
 * See docs/RAILWAY.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = (key) => process.env[key]?.trim() || undefined;
const port = Number(env("PORT") ?? 3000);
process.env.HOST ??= "0.0.0.0";
process.env.NITRO_HOST ??= "0.0.0.0";

const problems = [];
if (!env("DATABASE_URL")) problems.push("DATABASE_URL fehlt (Railway: ${{Postgres.DATABASE_URL}})");
const secret = env("BETTER_AUTH_SECRET");
if (!secret || secret.length < 32)
  problems.push("BETTER_AUTH_SECRET fehlt oder ist kürzer als 32 Zeichen");
if (!env("BETTER_AUTH_URL") && !env("RAILWAY_PUBLIC_DOMAIN")) {
  problems.push(
    "BETTER_AUTH_URL fehlt (öffentliche https-Adresse, oder in Railway eine Domain generieren)",
  );
}
const google = env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET");
const x = env("X_CLIENT_ID") && env("X_CLIENT_SECRET");
if (!google && !x)
  problems.push(
    "Kein Login-Anbieter: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (und/oder X_CLIENT_ID + X_CLIENT_SECRET) setzen",
  );
const serverEntry = join(root, ".output/server/index.mjs");
if (!existsSync(serverEntry)) {
  problems.push(
    existsSync(join(root, ".vercel/output"))
      ? "Build hat das Vercel-Format erzeugt. Variable NITRO_PRESET=node-server setzen und neu deployen"
      : "Kein Build gefunden (.output/server/index.mjs). Build-Befehl: npm run build",
  );
}
if (!env("ADMIN_EMAILS"))
  console.warn("[vela] Hinweis: ADMIN_EMAILS ist leer, /admin ist für niemanden freigeschaltet.");

function serveConfigError(lines) {
  console.error("\n[vela] ✖ VELA kann nicht starten. Bitte diese Variablen in Railway setzen:");
  for (const line of lines) console.error(`[vela]   - ${line}`);
  console.error("[vela] Anleitung: docs/RAILWAY.md\n");
  const html = `<!doctype html><meta charset="utf-8"><title>VELA – Konfiguration</title>
<body style="background:#12100e;color:#f3eee6;font:16px/1.5 system-ui;padding:2rem">
<h1>VELA ist noch nicht fertig eingerichtet</h1><p>Es fehlen Einstellungen (Details im Server-Log, Anleitung in docs/RAILWAY.md).</p></body>`;
  createServer((req, res) => {
    res.statusCode = 503;
    res.setHeader("cache-control", "no-store");
    if (req.url?.startsWith("/healthz")) {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(`config incomplete:\n${lines.join("\n")}\n`);
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  }).listen(port, "0.0.0.0", () => console.error(`[vela] Konfigurationsseite auf Port ${port}`));
}

if (problems.length) {
  serveConfigError(problems);
} else {
  const migrate = spawnSync(process.execPath, [join(root, "scripts/migrate.mjs")], {
    stdio: "inherit",
    env: { ...process.env, VELA_MIGRATE_AT_START: "1" },
  });
  if (migrate.status !== 0) {
    serveConfigError([
      "Datenbank-Migration fehlgeschlagen (siehe Fehler oben). Prüfe DATABASE_URL und ob der Postgres-Dienst läuft",
    ]);
  } else {
    console.log(`[vela] starte auf 0.0.0.0:${port}`);
    await import(pathToFileURL(serverEntry).href);
  }
}
