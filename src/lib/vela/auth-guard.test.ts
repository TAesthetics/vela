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

describe("per-account sign-in brake", () => {
  it("keys on the normalized address, never the raw one", async () => {
    const { signInAccountKey } = await import("./auth-guard.server.ts");
    const key = signInAccountKey("  Mia@Example.org ");
    assert.equal(key, signInAccountKey("mia@example.org"));
    assert.notEqual(key, signInAccountKey("other@example.org"));
    assert.ok(key.startsWith("vela:auth-sign-in-account:"));
    assert.ok(!key.includes("example"));
  });

  it("reads the e-mail only from e-mail sign-in requests", async () => {
    const { signInEmailOf } = await import("./auth-guard.server.ts");
    const post = (path: string, body: string) =>
      new Request(`https://vela.example${path}`, { method: "POST", body, headers: { "content-type": "application/json" } });
    assert.equal(await signInEmailOf(post("/api/auth/sign-in/email", '{"email":" Mia@Example.org","password":"x"}')), "mia@example.org");
    assert.equal(await signInEmailOf(post("/api/auth/sign-up/email", '{"email":"mia@example.org"}')), null);
    assert.equal(await signInEmailOf(post("/api/auth/sign-in/email", "not json")), null);
    assert.equal(await signInEmailOf(post("/api/auth/sign-in/email", '{"email":42}')), null);
    // The original body stays readable for Better Auth.
    const req = post("/api/auth/sign-in/email", '{"email":"a@b.c"}');
    await signInEmailOf(req);
    assert.equal(await req.text(), '{"email":"a@b.c"}');
  });

  it("counts only wrong passwords, locks after 10, and refunds everything else", async () => {
    const { withSignInAccountLimit, SIGN_IN_ACCOUNT_RULE, countsAsFailedSignIn } = await import("./auth-guard.server.ts");
    assert.equal(SIGN_IN_ACCOUNT_RULE.max, 10);
    assert.equal(countsAsFailedSignIn(401), true);
    assert.equal(countsAsFailedSignIn(200), false);
    assert.equal(countsAsFailedSignIn(400), false);
    // Fake Sql: one counter, same semantics as consumeRateLimit's upsert.
    let count = 0;
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("insert into")) {
        if (count >= SIGN_IN_ACCOUNT_RULE.max) return Promise.resolve([]);
        count += 1;
        return Promise.resolve([{ count }]);
      }
      if (text.includes("greatest(count - 1, 0)")) count = Math.max(count - 1, 0);
      return Promise.resolve([]);
    }) as unknown as import("@/lib/db").Sql;
    const getSql = async () => sql;
    const ok = () => Promise.resolve(new Response("{}", { status: 200 }));
    const wrong = () => Promise.resolve(new Response("{}", { status: 401 }));
    for (let i = 0; i < 20; i++) assert.equal((await withSignInAccountLimit("a@b.c", getSql, ok)).status, 200);
    assert.equal(count, 0);
    for (let i = 0; i < 10; i++) assert.equal((await withSignInAccountLimit("a@b.c", getSql, wrong)).status, 401);
    const locked = await withSignInAccountLimit("a@b.c", getSql, ok);
    assert.equal(locked.status, 429);
    assert.equal(((await locked.json()) as { code: string }).code, "ACCOUNT_LOCKED");
  });

  it("is wired into /api/auth and lifted by a password reset", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync(new URL("../../routes/api/auth/$.ts", import.meta.url), "utf8");
    assert.match(route, /withSignInAccountLimit\(email, getSql, \(\) => auth\.handler\(request\)\)/);
    const reset = readFileSync(new URL("./password-reset.server.ts", import.meta.url), "utf8");
    assert.match(reset, /clearSignInAccountLimit\(sql, owner\[0\]\.email\)/);
    const client = readFileSync(new URL("../auth/client.ts", import.meta.url), "utf8");
    assert.match(client, /code === "ACCOUNT_LOCKED"/);
  });
});
