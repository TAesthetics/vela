import assert from "node:assert/strict";
import test from "node:test";
import { SIGNED_OUT_TEXT, failureText, isOffline, isUnauthorized, type FailedAction } from "./request-failure.ts";

const ACTIONS: FailedAction[] = ["save", "swipe", "undo", "send", "block", "report", "uploadId"];

test("every failed request has its own offline and generic text", () => {
  for (const action of ACTIONS) {
    const offline = failureText(action, true);
    const failed = failureText(action, false);
    assert.ok(offline.startsWith("Keine Verbindung."), `${action}: offline text names the cause`);
    assert.ok(failed.length > 10 && !failed.startsWith("Keine Verbindung."), `${action}: generic text`);
    assert.notEqual(offline, failed);
  }
});

test("chat keeps its existing wording", () => {
  assert.equal(failureText("send", true), "Keine Verbindung. Deine Nachricht ist noch nicht raus.");
  assert.equal(failureText("send", false), "Senden hat nicht geklappt. Versuch es gleich nochmal.");
});

test("isOffline is false without a browser", () => {
  assert.equal(isOffline(), false);
});

test("isUnauthorized only matches the server's ended-session error", () => {
  const serverError = Object.assign(new Error("Unauthorized"), { name: "UnauthorizedError", status: 401 });
  assert.equal(isUnauthorized(serverError), true);
  // After serialization the class is gone, the message stays.
  assert.equal(isUnauthorized(new Error("Unauthorized")), true);
  assert.equal(isUnauthorized({ message: "Unauthorized" }), true);
  assert.equal(isUnauthorized(new Error("Failed to fetch")), false);
  assert.equal(isUnauthorized(new Error("unauthorized")), false);
  assert.equal(isUnauthorized("Unauthorized"), false);
  assert.equal(isUnauthorized(null), false);
  assert.equal(isUnauthorized(undefined), false);
});

test("signed-out text is short German", () => {
  assert.equal(SIGNED_OUT_TEXT, "Du wurdest abgemeldet.");
});
