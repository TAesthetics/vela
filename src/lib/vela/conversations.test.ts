// "Signale": order, unread dots and time labels of the conversation list.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatListTime, formatTime, hasUnread, sortThreadsByActivity, threadActivity, type Message } from "./data.ts";

function message(id: string, from: "me" | "them", at: number): Message {
  return { id, from, kind: "message", text: id, at };
}

describe("conversation list", () => {
  it("sorts by the newest message or the match, newest first", () => {
    const old = { id: "old", matchedAt: 1_000, messages: [message("a", "them", 9_000)] };
    const fresh = { id: "fresh", matchedAt: 5_000, messages: [] as Message[] };
    const quiet = { id: "quiet", matchedAt: 2_000, messages: [message("b", "me", 3_000)] };
    assert.deepEqual(
      sortThreadsByActivity([fresh, quiet, old]).map((thread) => thread.id),
      ["old", "fresh", "quiet"],
    );
    assert.equal(threadActivity(fresh), 5_000);
    assert.equal(threadActivity({ messages: [] }), 0);
  });

  it("keeps the server order for equal activity and doesn't change the input", () => {
    const input = [
      { id: "x", messages: [] as Message[] },
      { id: "y", messages: [] as Message[] },
    ];
    assert.deepEqual(sortThreadsByActivity(input).map((thread) => thread.id), ["x", "y"]);
    assert.deepEqual(input.map((thread) => thread.id), ["x", "y"]);
  });

  it("shows a dot only when the chat ends with the other person and has something new", () => {
    const theirs = { messages: [message("a", "me", 1), message("b", "them", 2)] };
    assert.equal(hasUnread(theirs, undefined), true);
    assert.equal(hasUnread(theirs, 1), true);
    assert.equal(hasUnread(theirs, 2), false);
    // My own last message (e.g. written on another device) leaves nothing to read.
    const mine = { messages: [message("a", "them", 1), message("b", "me", 2)] };
    assert.equal(hasUnread(mine, undefined), false);
    assert.equal(hasUnread({ messages: [] }, undefined), false);
    // Long chats count positions over the whole conversation.
    assert.equal(hasUnread({ messagesFrom: 300, messages: [message("c", "them", 3)] }, 300), true);
    assert.equal(hasUnread({ messagesFrom: 300, messages: [message("c", "them", 3)] }, 301), false);
  });

  it("labels times by day, not only with the clock", () => {
    const now = new Date(2026, 10, 26, 20, 0).getTime();
    const today = new Date(2026, 10, 26, 8, 5).getTime();
    assert.equal(formatListTime(today, now), formatTime(today));
    assert.equal(formatListTime(new Date(2026, 10, 25, 23, 59).getTime(), now), "Gestern");
    assert.match(formatListTime(new Date(2026, 10, 22, 12, 0).getTime(), now), /^(Mo|Di|Mi|Do|Fr|Sa|So)\.?$/);
    assert.equal(formatListTime(new Date(2026, 10, 12, 12, 0).getTime(), now), "12.11.");
    assert.equal(formatListTime(new Date(2025, 11, 31, 12, 0).getTime(), now), "31.12.25");
    // A clock a bit ahead on the other phone: still "today", never a future date.
    assert.equal(formatListTime(now + 60_000, now), formatTime(now + 60_000));
  });
});
