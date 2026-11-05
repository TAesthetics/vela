import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

/** Public: set a new password with an operator-created one-time link. */
export const resetPasswordWithLink = createServerFn({ method: "POST" })
  .validator((input: { token?: string; password?: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const reset = await import("@/lib/vela/password-reset.server");
    return reset.resetWithToken(
      sql,
      String(data?.token ?? ""),
      String(data?.password ?? ""),
      getRequest()?.headers ?? null,
    );
  });
