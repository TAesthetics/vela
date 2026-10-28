import { useEffect } from "react";
import { completeNativeSignIn } from "@/lib/auth/client";
import { initNativeShell } from "@/lib/native";

/** Native app setup (status bar, splash, back button, login deep link). Renders nothing. */
export function NativeShell() {
  useEffect(() => {
    void initNativeShell((url) => void completeNativeSignIn(url));
  }, []);
  return null;
}
