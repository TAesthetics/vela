// /admin/age: what the operator sees when opening a report.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportMessages, reportProfile } from "./report-context.ts";

const row = (id: string, from: string, at: string, kind = "message") => ({ id, from_user: from, body: `text ${id}`, kind, created_at: at });

describe("report context", () => {
  it("shows the latest messages oldest first, labelled by role, never by account ID", () => {
    const rows = [
      row("3", "bad", "2026-11-27T10:03:00Z"),
      row("2", "victim", "2026-11-27T10:02:00Z"),
      row("1", "bad", "2026-11-27T10:01:00Z", "note"),
    ];
    const { messages, more } = reportMessages(rows, "bad", "victim");
    assert.equal(more, false);
    assert.deepEqual(messages.map((message) => message.id), ["1", "2", "3"]);
    assert.deepEqual(messages.map((message) => message.by), ["reported", "reporter", "reported"]);
    assert.equal(messages[0].kind, "note");
    assert.equal(messages[2].at, "2026-11-27T10:03:00.000Z");
    assert.ok(!JSON.stringify(messages).includes("victim") && !JSON.stringify(messages).includes('"bad"'));
  });

  it("keeps only the newest ones and says there is more", () => {
    const rows = [row("c", "a", "2026-11-03"), row("b", "b", "2026-11-02"), row("a", "a", "2026-11-01")];
    const { messages, more } = reportMessages(rows, "a", "b", 2);
    assert.equal(more, true);
    assert.deepEqual(messages.map((message) => message.id), ["b", "c"]);
  });

  it("drops rows from anyone else", () => {
    const { messages } = reportMessages([row("x", "someone", "2026-11-01")], "a", "b");
    assert.equal(messages.length, 0);
  });

  it("reads a stored profile and handles a deleted one", () => {
    assert.equal(reportProfile(undefined), null);
    const profile = reportProfile({
      name: "Mia",
      age: 24,
      city: "Wien",
      orbit: "depth",
      values: '["Ehrlichkeit"]',
      prompts: [{ id: "p", q: "Frage?", a: "Antwort" }],
      photo: "javascript:alert(1)",
      status: "active",
      created_at: "2026-11-01T00:00:00Z",
    });
    assert.ok(profile);
    assert.deepEqual(profile.values, ["Ehrlichkeit"]);
    assert.deepEqual(profile.prompts, [{ q: "Frage?", a: "Antwort" }]);
    assert.equal(profile.photo, null);
    assert.equal(reportProfile({ ...{ name: "", age: null, city: "", orbit: "", values: "x", prompts: null, status: "", created_at: null }, photo: "data:image/jpeg;base64,AAAA" })?.photo, "data:image/jpeg;base64,AAAA");
  });

  it("loads only for the operator, before reading any data", () => {
    const src = readFileSync(new URL("./admin-api.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("export const loadReportContext"), src.indexOf("/** Lift a rule ban."));
    const guard = block.indexOf("isAdmin(sql, context.userId)");
    assert.ok(guard > 0 && guard < block.indexOf("from vela_reports"));
    assert.match(block, /where pair_a = \$\{pairA\} and pair_b = \$\{pairB\}/);
    assert.match(block, /from vela_profiles where user_id = \$\{reported\}/);
  });
});
