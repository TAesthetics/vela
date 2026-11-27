import { useState } from "react";
import { exportMyData } from "@/lib/vela/api";
import { isNativeApp } from "@/lib/native";
import { exportFailureText, isOffline, isShareCanceled } from "@/lib/vela/request-failure";
import { cn } from "@/components/vela/ui";

const MIME = "application/json";

/**
 * Store apps: a download link does nothing in the WebView (Android) and the
 * Web Share API is missing in Android's WebView, so the file is written to
 * the app's cache and handed to the system share sheet (save to Files /
 * Drive, mail, …). Returns false when the plugins are not in this app build
 * (older binary), so the caller falls back to the web paths.
 */
async function shareNative(name: string, data: string): Promise<boolean> {
  let filesystem: typeof import("@capacitor/filesystem") | null = null;
  let written = false;
  try {
    filesystem = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const { Filesystem, Directory, Encoding } = filesystem;
    const { uri } = await Filesystem.writeFile({
      path: name,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    written = true;
    await Share.share({ title: "Meine VELA-Daten", files: [uri] });
    return true;
  } catch (err) {
    if (isShareCanceled(err)) throw err;
    if (written) throw err;
    return false;
  } finally {
    // The copy only exists for the share sheet; don't keep personal data around.
    if (written && filesystem) {
      await filesystem.Filesystem.deleteFile({ path: name, directory: filesystem.Directory.Cache }).catch(
        () => undefined,
      );
    }
  }
}

async function downloadMyData(): Promise<void> {
  const data = await exportMyData();
  const name = `vela-daten-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNativeApp() && (await shareNative(name, data))) return;
  const blob = new Blob([data], { type: MIME });
  const file = typeof File === "function" ? new File([blob], name, { type: MIME }) : null;
  if (file && isNativeApp() && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "Meine VELA-Daten" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Meine Daten herunterladen" (Art. 15/20 DSGVO) with its own status line
 * right below the button. Used under Ich and on the suspended/banned screens,
 * so a locked account can still get its data before deleting it.
 */
export function DataExportButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setNote("");
          void downloadMyData()
            .then(() => setNote("Export erstellt."))
            .catch((err: unknown) => setNote(exportFailureText(err, isOffline()) ?? ""))
            .finally(() => setBusy(false));
        }}
        className="block h-11 text-sm text-muted"
      >
        {busy ? "Export wird erstellt…" : "Meine Daten herunterladen"}
      </button>
      <p role="status" className={cn("text-sm text-ember", !note && "sr-only")}>
        {note}
      </p>
    </div>
  );
}
