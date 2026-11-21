import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authRuleFor } from "./auth-guard.server.ts";

describe("authRuleFor", () => {
  it("limits sign-in and sign-up like Better Auth's custom rules", () => {
    assert.deepEqual(authRuleFor("https://vela.example/api/auth/sign-in/email"), {
      scope: "vela:auth-sign-in",
      rule: { windowSec: 900, max: 30 },
    });
    assert.equal(authRuleFor("https://vela.example/api/auth/sign-up/email")?.rule.max, 10);
    assert.equal(authRuleFor("https://vela.example/api/auth/change-password/")?.scope, "vela:auth-change-password");
    assert.equal(authRuleFor("https://vela.example/api/auth/change-email")?.scope, "vela:auth-change-email");
  });

  it("leaves other auth endpoints alone", () => {
    assert.equal(authRuleFor("https://vela.example/api/auth/get-session"), null);
    assert.equal(authRuleFor("https://vela.example/api/auth/sign-out"), null);
    assert.equal(authRuleFor("not a url"), null);
  });
});

describe("server-function sessions", () => {
  it("check the session in the database, not only the cookie cache", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../auth/verify.server.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export async function getSessionUser"), src.indexOf("export async function requireUserId"));
    assert.match(fn, /auth\.api\.getSession\(\{ headers, query: \{ disableCookieCache: true \} \}\)/);
    assert.doesNotMatch(fn, /auth\.api\.getSession\(\{ headers \}\)/);
  });
});
