/**
 * Errors whose message is meant for the person (shown as a toast), not a bug.
 * Server error monitoring (server-errors.server.ts) skips them. Kept as plain
 * `Error` objects so they reach the app exactly as before; only this
 * server-side WeakSet remembers that they were thrown on purpose.
 */
const expected = new WeakSet<object>();

export function userFacingError(message: string): Error {
  const err = new Error(message);
  expected.add(err);
  return err;
}

export function isUserFacingError(err: unknown): boolean {
  return typeof err === "object" && err !== null && expected.has(err);
}
