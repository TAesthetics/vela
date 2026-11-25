import assert from "node:assert/strict";
import test from "node:test";
import { handleBack, registerBack, resetBackStack } from "./back-stack.ts";

test("nothing open: back is not handled (app may leave)", () => {
  resetBackStack();
  assert.equal(handleBack(), false);
  assert.equal(handleBack("escape"), false);
});

test("latest screen handler wins, and unregistering falls back", () => {
  resetBackStack();
  const calls: string[] = [];
  const offTabs = registerBack("screen", () => calls.push("tabs"));
  const offChat = registerBack("screen", () => calls.push("chat"));
  assert.equal(handleBack(), true);
  offChat();
  assert.equal(handleBack(), true);
  offTabs();
  assert.equal(handleBack(), false);
  assert.deepEqual(calls, ["chat", "tabs"]);
});

test("a dialog closes before the screen behind it, even if the screen registered later", () => {
  resetBackStack();
  const calls: string[] = [];
  const offSheet = registerBack("dialog", () => calls.push("sheet"));
  registerBack("screen", () => calls.push("chat"));
  handleBack();
  offSheet();
  handleBack();
  assert.deepEqual(calls, ["sheet", "chat"]);
});

test("Escape only closes dialogs, never a screen", () => {
  resetBackStack();
  const calls: string[] = [];
  registerBack("screen", () => calls.push("chat"));
  assert.equal(handleBack("escape"), false);
  const off = registerBack("dialog", () => calls.push("menu"));
  assert.equal(handleBack("escape"), true);
  off();
  assert.deepEqual(calls, ["menu"]);
});

test("unregistering twice is harmless", () => {
  resetBackStack();
  const off = registerBack("dialog", () => undefined);
  off();
  off();
  assert.equal(handleBack(), false);
});
