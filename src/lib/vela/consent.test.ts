// New profiles must confirm 18+ and accept the AGB with the community rules
// (zero tolerance for abusive content and people, Apple 1.2), and the server
// must store when they did.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankMe, consentProblem } from "./data.ts";

describe("profile consent", () => {
  it("needs both ticks, each with its own hint", () => {
    assert.match(consentProblem(blankMe()) ?? "", /18/);
    assert.match(consentProblem({ adultConfirmed: true, termsAccepted: false }) ?? "", /AGB/);
    assert.match(consentProblem({ adultConfirmed: false, termsAccepted: true }) ?? "", /18/);
    assert.equal(consentProblem({ adultConfirmed: true, termsAccepted: true }), null);
  });

  it("only accepts a real true (old clients without the field, strings, 1)", () => {
    assert.notEqual(consentProblem({ adultConfirmed: true }), null);
    assert.notEqual(consentProblem({ adultConfirmed: true, termsAccepted: "true" }), null);
    assert.notEqual(consentProblem({ adultConfirmed: true, termsAccepted: 1 }), null);
    assert.notEqual(consentProblem({ adultConfirmed: "yes", termsAccepted: true }), null);
  });

  it("is checked by saveProfile and stored once with a timestamp", () => {
    const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    const clean = api.slice(api.indexOf("function cleanProfile"), api.indexOf("export const loadVela"));
    assert.match(clean, /consentProblem\(raw\)/);
    assert.match(api, /terms_accepted_at = coalesce\(vela_profiles\.terms_accepted_at, excluded\.terms_accepted_at\)/);
    const migration = readFileSync(new URL("../../../migrations/0019_terms_accepted.sql", import.meta.url), "utf8");
    assert.match(migration, /add column if not exists terms_accepted_at timestamptz/);
  });

  it("the AGB spell out the rules and zero tolerance under #regeln", () => {
    const agb = readFileSync(new URL("../../routes/agb.tsx", import.meta.url), "utf8");
    assert.match(agb, /id="regeln"/);
    assert.match(agb, /keine Toleranz/);
    assert.match(agb, /sperren wir das Konto/);
  });
});
