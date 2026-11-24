import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_LIKE_EMAIL_MESSAGE, WEAK_PASSWORD_MESSAGE, weakPasswordReason } from "./password-policy.ts";

describe("weakPasswordReason", () => {
  it("refuses the passwords guessed first", () => {
    for (const p of [
      "12345678", "Passwort", "passwort123", "Passwort123!", "PASSWORD1", "qwertzuiop", "iloveyou",
      "hallo2026", "sommer2026", "11111111", "abababab", "87654321", "abcdefgh", "lkjhgfds", "vela1234",
      "24121999", "24.12.1999", "1999-12-24", "Fußball1",
    ]) {
      assert.equal(weakPasswordReason(p), WEAK_PASSWORD_MESSAGE, p);
    }
  });

  it("refuses passwords built from the account e-mail", () => {
    assert.equal(weakPasswordReason("mia.huber2026", "Mia.Huber@example.org"), PASSWORD_LIKE_EMAIL_MESSAGE);
    assert.equal(weakPasswordReason("xx mia.huber@example.org", "mia.huber@example.org"), PASSWORD_LIKE_EMAIL_MESSAGE);
    assert.equal(weakPasswordReason("mia.huber2026", null), null);
    // A short local part alone is not a reason.
    assert.equal(weakPasswordReason("mi-tanzt-im-regen", "mi@example.org"), null);
  });

  it("accepts ordinary own passwords and leaves length to the length rule", () => {
    for (const p of ["Kaffee mit Mondlicht", "tanzende-Ziege-42", "48291736", "Schleier!Fällt7", "veilchenblau-im-mai"]) {
      assert.equal(weakPasswordReason(p, "mia@example.org"), null, p);
    }
    assert.equal(weakPasswordReason("1234"), null);
  });
});

describe("weakPasswordRejected", () => {
  const post = (path: string, body: unknown) =>
    new Request(`https://vela.example/api/auth${path}`, { method: "POST", body: JSON.stringify(body) });

  it("checks sign-up, password change and reset, never sign-in", async () => {
    const { weakPasswordRejected } = await import("./auth-guard.server.ts");
    const signUp = await weakPasswordRejected(post("/sign-up/email", { email: "a@b.at", password: "passwort1" }));
    assert.equal(signUp?.status, 400);
    assert.deepEqual(await signUp?.json(), { code: "PASSWORD_TOO_WEAK", message: WEAK_PASSWORD_MESSAGE });
    assert.equal((await weakPasswordRejected(post("/change-password/", { newPassword: "12345678" })))?.status, 400);
    assert.equal((await weakPasswordRejected(post("/reset-password", { newPassword: "qwertzuiop" })))?.status, 400);
    assert.equal(await weakPasswordRejected(post("/sign-in/email", { email: "a@b.at", password: "12345678" })), null);
    assert.equal(await weakPasswordRejected(post("/sign-up/email", { email: "a@b.at", password: "Mond über Graz" })), null);
    assert.equal(await weakPasswordRejected(new Request("https://vela.example/api/auth/sign-up/email", { method: "POST", body: "{" })), null);
  });

  it("uses the e-mail of the sign-up", async () => {
    const { weakPasswordRejected } = await import("./auth-guard.server.ts");
    const res = await weakPasswordRejected(post("/sign-up/email", { email: "lena.berg@example.org", password: "lena.berg99" }));
    assert.equal((await res?.json())?.message, PASSWORD_LIKE_EMAIL_MESSAGE);
  });
});
