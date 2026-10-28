import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { Suspension } from "@/lib/vela/data";
import { useVela } from "@/lib/vela/store";
import { PrimaryButton, Wordmark } from "@/components/vela/ui";
import { LegalLinks } from "@/components/vela/legal";
import { signOut } from "@/lib/auth/client";

/** Re-encode the ID photo to JPEG (strips EXIF/GPS), max 1600 px, ≤ ~1.4 MB. */
function encodeIdPhoto(file: File) {
  return new Promise<string | null>((resolve) => {
    if (!file.type.startsWith("image/") || file.size > 15_000_000) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.startsWith("data:image/jpeg") && data.length <= 1_900_000) {
          resolve(data);
          return;
        }
      }
      resolve(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export function Suspended({ suspension }: { suspension: Suspension }) {
  const uploadId = useVela((state) => state.uploadId);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = suspension.idCheck === "pending";

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const image = await encodeIdPhoto(file);
      if (!image) {
        setError("Das Bild ließ sich nicht verarbeiten. Bitte ein anderes Foto.");
        return;
      }
      const result = await uploadId(image);
      if (result) setError(result);
      else setFile(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8">
      <Wordmark />
      <ShieldAlert className="mt-8 size-8 text-ember" />
      <h1 className="mt-4 font-display text-3xl leading-tight text-paper">Dein Konto ist vorübergehend gesperrt.</h1>
      <p className="mt-4 text-base text-muted">
        Vela ist nur für Erwachsene. Eine automatische Prüfung deiner Texte oder eine Meldung deutet darauf hin, dass
        du jünger als 18 sein könntest. Solange die Sperre besteht, sieht dich niemand und du kannst nicht swipen oder
        schreiben.
      </p>
      <p className="mt-3 text-base text-muted">
        Wenn das ein Irrtum ist: Lade ein Foto eines amtlichen Ausweises hoch. Ein Mensch prüft nur dein Geburtsdatum
        und hebt die Sperre auf. Das Bild ist nur für den Betreiber sichtbar und wird nach der Entscheidung sofort
        gelöscht, spätestens nach 30 Tagen. Du darfst alles außer Foto, Name und Geburtsdatum abdecken.
      </p>

      {pending ? (
        <p className="mt-8 rounded-2xl bg-surface p-4 text-sm text-paper">
          Dein Ausweis ist eingegangen und wird geprüft. Wir melden uns, sobald die Entscheidung gefallen ist.
        </p>
      ) : (
        <div className="mt-8 grid gap-3">
          {suspension.idCheck === "rejected" && (
            <p className="rounded-2xl bg-surface p-4 text-sm text-paper">
              Die letzte Prüfung war nicht erfolgreich. Du kannst einen anderen, gut lesbaren Ausweis hochladen.
            </p>
          )}
          {suspension.idCheck === "expired" && (
            <p className="rounded-2xl bg-surface p-4 text-sm text-paper">
              Die letzte Prüfung ist abgelaufen. Bitte lade den Ausweis noch einmal hoch.
            </p>
          )}
          <label className="text-sm text-muted">
            Ausweisfoto (JPEG, PNG oder HEIC aus der Kamera)
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-surface file:px-4 file:text-paper"
            />
          </label>
          {error && <p className="text-sm text-ember">{error}</p>}
          <PrimaryButton disabled={!file || busy} onClick={() => void submit()}>
            {busy ? "Wird hochgeladen…" : "Ausweis zur Prüfung senden"}
          </PrimaryButton>
        </div>
      )}

      <button type="button" onClick={() => void signOut("/")} className="mt-8 h-11 text-sm text-muted">
        Abmelden
      </button>
      <LegalLinks className="mt-4" />
    </div>
  );
}
