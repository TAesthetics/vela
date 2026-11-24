import { createMiddleware } from "@tanstack/react-start";

/**
 * Server-function middleware: an unexpected error thrown by the handler is
 * recorded (anonymously, see server-errors.server.ts) and then re-thrown
 * unchanged, so the app sees exactly what it saw before. Put it AFTER
 * authMiddleware: signed-out requests never reach it.
 */
export const errorMonitor = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  try {
    return await next();
  } catch (err) {
    // ONLY import `*.server` modules here (this file is shared with the client).
    const { recordServerError } = await import("./server-errors.server");
    await recordServerError(`fn:${serverFnMeta?.name || "unknown"}`, err);
    throw err;
  }
});
