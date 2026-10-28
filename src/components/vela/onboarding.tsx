import { useState } from "react";
import { ORBITS, VALUES, blankMe, nextQuestion, type Me, type Orbit } from "@/lib/vela/data";
import { useVela } from "@/lib/vela/store";
import { FieldLabel, PrimaryButton, TextInput, Wordmark, cn } from "@/components/vela/ui";

export function Onboarding() {
  const save = useVela((state) => state.save);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Me>(blankMe);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function patch(partial: Partial<Me>) {
    setDraft((current) => ({ ...current, ...partial }));
    setError("");
  }

  function validate() {
    if (step === 1) {
      if (draft.name.trim().length < 2) return "Wie sollen wir dich nennen?";
      if (draft.age < 18 || draft.age > 99) return "Vela ist nur für Erwachsene.";
      if (draft.city.trim().length < 2) return "In welcher Stadt bist du heute Nacht?";
    }
    if (step === 3) {
      if (draft.prompts.some((prompt) => prompt.a.trim().length < 8)) {
        return "Zwei echte Sätze. Mindestens ein paar Worte.";
      }
    }
    if (step === 4 && draft.values.length !== 3) return "Wähl drei, nicht mehr.";
    return "";
  }

  async function next() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (step === 4) {
      setBusy(true);
      const failed = await save({
        ...draft,
        name: draft.name.trim(),
        city: draft.city.trim(),
        prompts: draft.prompts.map((prompt) => ({ ...prompt, a: prompt.a.trim() })),
        onboarded: true,
      });
      setBusy(false);
      if (failed) setError(failed);
      return;
    }
    setStep((value) => value + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-8 pb-6">
      <div className="flex items-center justify-between">
        <Wordmark />
        {step > 0 && <span className="text-xs tracking-widest text-muted">Schritt {step} von 4</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-8">
        {step === 0 && <Welcome onStart={() => setStep(1)} />}
        {step === 1 && <Basics draft={draft} patch={patch} onError={setError} />}
        {step === 2 && (
          <OrbitPick
            orbit={draft.orbit}
            onPick={(orbit) => patch({ orbit })}
          />
        )}
        {step === 3 && <Prompts draft={draft} patch={patch} />}
        {step === 4 && (
          <ValuesPick
            values={draft.values}
            onToggle={(value) => {
              const has = draft.values.includes(value);
              if (has) patch({ values: draft.values.filter((item) => item !== value) });
              else if (draft.values.length < 3) patch({ values: [...draft.values, value] });
            }}
          />
        )}
        {error && <p className="mt-4 text-sm text-ember">{error}</p>}
      </div>
      {step > 0 && (
        <div className="mt-4 grid gap-3">
          <PrimaryButton onClick={() => void next()} disabled={busy}>
            {step === 4 ? (busy ? "Speichert…" : "Orbit betreten") : "Weiter"}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep((value) => value - 1);
            }}
            className="h-11 text-sm text-muted"
          >
            Zurück
          </button>
        </div>
      )}
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <p className="text-xs tracking-widest text-ember">DATING, NEU GEDACHT</p>
      <h1 className="mt-4 font-display text-4xl leading-tight text-paper">
        Erst der Satz.
        <br />
        Dann das Gesicht.
      </h1>
      <p className="mt-5 text-base text-muted">
        Du funkst auf einen Gedanken, nicht auf ein Selfie. Das Porträt bleibt hinter dem Schleier,
        bis ihr wirklich geschrieben habt. Keine erfundenen Leute. Nur Profile, die jemand selbst anlegt.
      </p>
      <div className="mt-8">
        <PrimaryButton onClick={onStart}>Profil anlegen</PrimaryButton>
      </div>
      <p className="mt-6 text-sm text-muted">Nur für Erwachsene. Dein Profil liegt in der Datenbank.</p>
    </div>
  );
}

function Basics({
  draft,
  patch,
  onError,
}: {
  draft: Me;
  patch: (partial: Partial<Me>) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="font-display text-3xl text-paper">Wer schreibt da?</h2>
        <p className="mt-2 text-sm text-muted">Ein Vorname reicht. Der Rest kommt in Sätzen.</p>
      </div>
      <label>
        <FieldLabel>Vorname</FieldLabel>
        <TextInput value={draft.name} placeholder="Mira" onChange={(name) => patch({ name })} />
      </label>
      <label>
        <FieldLabel>Alter</FieldLabel>
        <TextInput
          value={draft.age ? String(draft.age) : ""}
          inputMode="numeric"
          placeholder="29"
          onChange={(value) => {
            const age = Number(value.replace(/[^\d]/g, "").slice(0, 2));
            patch({ age: Number.isFinite(age) ? age : 0 });
          }}
        />
      </label>
      <label>
        <FieldLabel>Stadt</FieldLabel>
        <TextInput value={draft.city} placeholder="Berlin" onChange={(city) => patch({ city })} />
      </label>
      <label>
        <FieldLabel>Porträt, optional</FieldLabel>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void compressPortrait(file).then((photo) => {
              if (!photo) {
                onError("Das Bild ist zu groß oder unbrauchbar.");
                return;
              }
              patch({ photo });
            });
          }}
          className="mt-2 block w-full text-sm text-muted file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-surface file:px-4 file:text-paper"
        />
        {draft.photo && <p className="mt-2 text-sm text-muted">Liegt bereit. Sichtbar erst im Chat.</p>}
      </label>
    </div>
  );
}

function OrbitPick({ orbit, onPick }: { orbit: Orbit; onPick: (orbit: Orbit) => void }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-paper">In welchem Orbit bist du?</h2>
      <p className="mt-2 mb-5 text-sm text-muted">Gleiche Absicht zuerst. Nicht gleiche Optik.</p>
      <div className="grid gap-3">
        {ORBITS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            className={cn(
              "rounded-2xl border px-4 py-4 text-left",
              orbit === item.id ? "border-ember bg-surface" : "border-line",
            )}
          >
            <span className="block font-display text-2xl text-paper">{item.label}</span>
            <span className="mt-1 block text-sm text-muted">{item.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Prompts({ draft, patch }: { draft: Me; patch: (partial: Partial<Me>) => void }) {
  function setPrompt(index: number, partial: Partial<Me["prompts"][number]>) {
    patch({
      prompts: draft.prompts.map((prompt, promptIndex) =>
        promptIndex === index ? { ...prompt, ...partial } : prompt,
      ),
    });
  }

  return (
    <div>
      <h2 className="font-display text-3xl text-paper">Zwei Sätze, die dich verraten.</h2>
      <p className="mt-2 mb-5 text-sm text-muted">Darauf werden andere funken. Nicht auf dein Kinn.</p>
      <div className="grid gap-4">
        {draft.prompts.map((prompt, index) => (
          <div key={prompt.id} className="rounded-2xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-xl text-paper">{prompt.q}</p>
              <button
                type="button"
                onClick={() =>
                  setPrompt(index, {
                    q: nextQuestion(prompt.q, draft.prompts[index === 0 ? 1 : 0]?.q ?? ""),
                  })
                }
                className="shrink-0 text-sm text-ember"
              >
                Andere
              </button>
            </div>
            <textarea
              value={prompt.a}
              rows={3}
              onChange={(event) => setPrompt(index, { a: event.target.value })}
              placeholder="Konkret. Sinnlich. Kein Pitch."
              className="mt-3 w-full resize-none rounded-xl border border-line bg-bg px-3 py-3 text-base text-paper outline-none placeholder:text-muted"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ValuesPick({ values, onToggle }: { values: string[]; onToggle: (value: string) => void }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-paper">Drei Dinge, die bleiben.</h2>
      <p className="mt-2 mb-5 text-sm text-muted">{values.length} von 3 gewählt.</p>
      <div className="flex flex-wrap gap-2">
        {VALUES.map((value) => {
          const on = values.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                "h-11 rounded-full px-4 text-sm",
                on ? "bg-ember text-ink" : "bg-surface text-paper",
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function compressPortrait(file: File) {
  return new Promise<string | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL("image/jpeg", 0.72);
      resolve(data.startsWith("data:image/jpeg") && data.length <= 120_000 ? data : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
