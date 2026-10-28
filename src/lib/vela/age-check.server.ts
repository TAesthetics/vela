/**
 * AI minor detection — server-only (never import from client code).
 *
 * Sends ONLY text (profile answers, chat messages written by the person) to an
 * OpenAI-compatible chat endpoint. Never photos, never ID documents.
 *
 * Env (all optional):
 *   AGE_CHECK_API_KEY  or XAI_API_KEY   – API key; missing → AI is skipped
 *   AGE_CHECK_BASE_URL (default https://api.x.ai/v1)
 *   AGE_CHECK_MODEL    (default grok-4.7)
 *   AGE_CHECK_THRESHOLD (default 0.8) – likelihood at or above which we suspend
 */
import type { Sql } from "@/lib/db";

export type AgeSource = "profile" | "message" | "report" | "operator";
export type AgeAssessment = { likelihood: number; signals: string[]; model: string };

const env = (key: string) => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export function ageCheckThreshold() {
  const raw = Number(env("AGE_CHECK_THRESHOLD"));
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.8;
}

function config() {
  const apiKey = env("AGE_CHECK_API_KEY") ?? env("XAI_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env("AGE_CHECK_BASE_URL") ?? "https://api.x.ai/v1").replace(/\/+$/, ""),
    model: env("AGE_CHECK_MODEL") ?? "grok-4.7",
  };
}

const SYSTEM_PROMPT = `Du prüfst Texte aus einer Dating-App für Erwachsene (18+) auf Hinweise, dass die schreibende Person minderjährig ist.
Bewerte nur die Person, die die Texte geschrieben hat. Starke Hinweise: Altersangaben unter 18, Schulklasse/Unterstufe/Oberstufe als Schüler:in, "meine Eltern erlauben", Bezug auf Matura/Abitur in der Zukunft als Schüler:in, Lehrer:innen als eigene, Kinderschutz-Themen in eigener Sache.
Schwache Hinweise allein (Jugendsprache, Rechtschreibfehler, Emojis) reichen NICHT. Studierende, Lehrkräfte, Eltern und Erwachsene, die über ihre Jugend schreiben, sind keine Hinweise.
Antworte ausschließlich mit JSON: {"minor_likelihood": Zahl 0 bis 1, "signals": [kurze deutsche Begründungen, max. 5]}.`;

/** Ask the model. Returns null when no key is configured or the call fails. */
export async function assessMinor(texts: string[]): Promise<AgeAssessment | null> {
  const cfg = config();
  const input = texts.map((text) => text.trim()).filter(Boolean).join("\n---\n").slice(0, 6000);
  if (!input) return null;
  if (!cfg) {
    console.info("[age-check] no AGE_CHECK_API_KEY / XAI_API_KEY set — AI check skipped");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Texte der Person:\n${input}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[age-check] provider error", res.status);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseAssessment(body.choices?.[0]?.message?.content ?? "", cfg.model);
  } catch (err) {
    console.error("[age-check] request failed", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Strict parse of the model's JSON; anything malformed counts as "no result". */
export function parseAssessment(content: string, model: string): AgeAssessment | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as { minor_likelihood?: unknown; signals?: unknown };
    const likelihood = Number(raw.minor_likelihood);
    if (!Number.isFinite(likelihood) || likelihood < 0 || likelihood > 1) return null;
    const signals = Array.isArray(raw.signals)
      ? raw.signals.map((s) => String(s).slice(0, 200)).slice(0, 5)
      : [];
    return { likelihood, signals, model };
  } catch {
    return null;
  }
}

export async function recordFlag(
  sql: Sql,
  userId: string,
  source: AgeSource,
  action: "none" | "review" | "suspended",
  assessment: AgeAssessment | null,
  extraSignals: string[] = [],
) {
  await sql`
    insert into vela_age_flags (id, user_id, source, minor_likelihood, signals, model, action)
    values (
      ${crypto.randomUUID()},
      ${userId},
      ${source},
      ${assessment?.likelihood ?? null},
      ${JSON.stringify([...(assessment?.signals ?? []), ...extraSignals])}::jsonb,
      ${assessment?.model ?? null},
      ${action}
    )
  `;
}

export async function suspendForAge(sql: Sql, userId: string) {
  await sql`
    update vela_profiles set status = 'suspended_age', suspended_at = now()
    where user_id = ${userId} and status = 'active'
  `;
}

/** Profile answers + the person's own latest messages (text only). */
export async function textsOf(sql: Sql, userId: string) {
  const profile = await sql<{ name: string; city: string; prompts: unknown }>`
    select name, city, prompts from vela_profiles where user_id = ${userId}
  `;
  const messages = await sql<{ body: string }>`
    select body from vela_messages where from_user = ${userId}
    order by created_at desc limit 20
  `;
  const texts: string[] = [];
  const row = profile[0];
  if (row) {
    texts.push(`Name: ${row.name}, Stadt: ${row.city}`);
    const prompts = typeof row.prompts === "string" ? JSON.parse(row.prompts) : row.prompts;
    if (Array.isArray(prompts)) {
      for (const p of prompts as { q?: unknown; a?: unknown }[]) texts.push(`${String(p.q)}: ${String(p.a)}`);
    }
  }
  for (const m of messages) texts.push(m.body);
  return texts;
}

/**
 * Run the AI check for one person and act on it. Returns true if suspended.
 * Never throws — age checks must not break saving or chatting.
 */
export async function runAgeCheck(sql: Sql, userId: string, source: AgeSource): Promise<boolean> {
  try {
    const assessment = await assessMinor(await textsOf(sql, userId));
    if (!assessment) return false;
    const suspend = assessment.likelihood >= ageCheckThreshold();
    if (suspend) await suspendForAge(sql, userId);
    if (suspend || assessment.likelihood >= 0.5) {
      await recordFlag(sql, userId, source, suspend ? "suspended" : "review", assessment);
    }
    return suspend;
  } catch (err) {
    console.error("[age-check] failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Delete ID images older than 30 days (and any still pending → expired). */
export async function purgeOldIdImages(sql: Sql) {
  await sql`
    update vela_id_checks
    set image = null,
        status = case when status = 'pending' then 'expired' else status end
    where image is not null and created_at < now() - interval '30 days'
  `;
}
