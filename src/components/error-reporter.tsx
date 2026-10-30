import { useEffect } from "react";
import { installErrorReporter } from "@/lib/vela/error-reporter";

/** Installs the anonymous crash reporter once. Renders nothing. */
export function ErrorReporter() {
  useEffect(() => installErrorReporter(), []);
  return null;
}
