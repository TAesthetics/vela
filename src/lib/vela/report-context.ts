// What the operator sees when opening a report on /admin/age: the reported
// profile and the chat between the two people (Datenschutz 4: messages can be
// checked when they are reported). Pure helpers, so they can be tested.

/** Messages shown per report, newest last. Enough to judge harassment or spam. */
export const REPORT_CONTEXT_MESSAGES = 30;

export type ReportMessage = {
  id: string;
  /** "reported" = the person the report is about, "reporter" = who reported. */
  by: "reported" | "reporter";
  kind: "note" | "message";
  text: string;
  at: string;
};

export type ReportProfile = {
  name: string;
  age: number | null;
  city: string;
  orbit: string;
  values: string[];
  prompts: { q: string; a: string }[];
  photo: string | null;
  status: string;
  createdAt: string;
};

export type ReportContext =
  | { ok: false; error: string }
  | {
      ok: true;
      /** null: the profile was deleted since the report. */
      profile: ReportProfile | null;
      messages: ReportMessage[];
      /** True when the chat is longer than what is shown. */
      more: boolean;
    };

type MessageRow = { id: unknown; from_user: unknown; body: unknown; kind: unknown; created_at: unknown };

function iso(value: unknown) {
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Rows come newest first (limit + 1 to know whether there is more); the
 * operator reads them oldest first. Only messages of the two people in the
 * report are kept and labelled by role, never by account ID.
 */
export function reportMessages(
  rows: MessageRow[],
  reportedId: string,
  reporterId: string,
  limit = REPORT_CONTEXT_MESSAGES,
): { messages: ReportMessage[]; more: boolean } {
  const relevant = rows.filter((row) => row.from_user === reportedId || row.from_user === reporterId);
  const shown = relevant.slice(0, limit).reverse();
  return {
    more: relevant.length > limit,
    messages: shown.map((row) => ({
      id: String(row.id),
      by: row.from_user === reportedId ? "reported" : "reporter",
      kind: row.kind === "note" ? "note" : "message",
      text: String(row.body ?? ""),
      at: iso(row.created_at),
    })),
  };
}

function asList(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/** A profile row as the operator sees it (text fields as stored, photo as data URL). */
export function reportProfile(row: {
  name: unknown;
  age: unknown;
  city: unknown;
  orbit: unknown;
  values: unknown;
  prompts: unknown;
  photo: unknown;
  status: unknown;
  created_at: unknown;
} | undefined): ReportProfile | null {
  if (!row) return null;
  const age = Number(row.age);
  return {
    name: String(row.name ?? ""),
    age: Number.isFinite(age) && row.age !== null ? age : null,
    city: String(row.city ?? ""),
    orbit: String(row.orbit ?? ""),
    values: asList(row.values).map(String),
    prompts: asList(row.prompts)
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const prompt = item as { q?: unknown; a?: unknown };
        return { q: String(prompt.q ?? ""), a: String(prompt.a ?? "") };
      }),
    photo: typeof row.photo === "string" && row.photo.startsWith("data:image/") ? row.photo : null,
    status: String(row.status ?? ""),
    createdAt: iso(row.created_at),
  };
}
