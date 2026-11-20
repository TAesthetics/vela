import assert from "node:assert/strict";
import test from "node:test";
import { failureText, isOffline, type FailedAction } from "./request-failure.ts";

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
