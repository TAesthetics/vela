import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Compass, Eye, Flame, MessageCircle, Smartphone, Undo2, UserRound } from "lucide-react";
import {
  ICEBREAKERS,
  ORBITS,
  VEIL_AFTER,
  VALUES,
  PLUS_PRICE_LABEL,
  formatTime,
  orbitLabel,
  RESONANCE,
  resonanceParts,
  type Orbit,
} from "@/lib/vela/data";
import { useVela } from "@/lib/vela/store";
import { UserButton } from "@/lib/auth/gates";
import { FieldLabel, Portrait, PrimaryButton, TextInput, cn } from "@/components/vela/ui";
import { SafetyMenu } from "@/components/vela/safety";
import { LegalLinks } from "@/components/vela/legal";
import { exportMyData } from "@/lib/vela/api";
import { isNativeApp } from "@/lib/native";

export function Signals({
  onChat,
  onPerson,
  onPlus,
}: {
  onChat: (id: string) => void;
  onPerson: (id: string) => void;
  onPlus: () => void;
}) {
  const threads = useVela((state) => state.threads);
  const seen = useVela((state) => state.seen);
  const inbound = useVela((state) => state.inbound);
  const inboundCount = useVela((state) => state.inboundCount);
  const plus = useVela((state) => state.plus);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pt-5 pb-2">
        <h1 className="font-display text-4xl text-paper">Signale</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <p className="mt-2 text-xs tracking-widest text-muted uppercase">Gespräche</p>
        {threads.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Noch keine. Funk auf einen Satz, nicht auf ein Gesicht.
          </p>
        ) : (
          <ul className="mt-2">
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = thread.messages.length > (seen[thread.person.id] ?? 0);
              return (
                <li key={thread.person.id}>
                  <button
                    type="button"
                    onClick={() => onChat(thread.person.id)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <Portrait
                      src={thread.photo}
                      name={thread.person.name}
                      veiled={!thread.unveiled}
                      className="size-14 shrink-0 rounded-2xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-paper">{thread.person.name}</span>
                        {last && (
                          <span className="text-xs text-muted tabular-nums">{formatTime(last.at)}</span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted">
                        {thread.unveiled && last ? last.text : (last?.text ?? "Schreib den ersten Satz.")}
                      </span>
                    </span>
                    {unread && <span className="size-2 shrink-0 rounded-full bg-ember" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-xs tracking-widest text-muted uppercase">Wartet schon</p>
        {inboundCount === 0 ? (
          <p className="mt-3 text-sm text-muted">Gerade funkst niemand im Stillen zurück.</p>
        ) : plus ? (
          <ul className="mt-3 grid gap-2">
            {inbound.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onPerson(person.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left"
                >
                  <Portrait name={person.name} veiled className="size-14 shrink-0 rounded-full" />
                  <span className="min-w-0">
                    <span className="block font-medium text-paper">
                      {person.name}, {person.age}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">{person.prompts[0]?.a}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" onClick={onPlus} className="mt-3 w-full rounded-3xl bg-surface p-4 text-left">
            <span className="mt-1 block font-display text-2xl text-paper">
              {inboundCount} {inboundCount === 1 ? "Mensch wartet" : "Menschen warten"} schon
            </span>
            <span className="mt-2 block text-sm text-muted">
              Mit Vela+ siehst du, wer auf diese Art von Sätzen anspringt. Das Gesicht bleibt zu.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

export function Chat({ id, onBack }: { id: string; onBack: () => void }) {
  const thread = useVela((state) => state.thread(id));
  const send = useVela((state) => state.send);
  const markSeen = useVela((state) => state.markSeen);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = thread?.messages ?? [];
  // Counts come from the server (spark notes excluded) — same rule that lifts the veil.
  const mine = thread?.mineCount ?? 0;
  const theirs = thread?.theirCount ?? 0;
  const need = Math.max(0, VEIL_AFTER - mine);

  useEffect(() => {
    markSeen(id);
  }, [id, messages.length, markSeen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <button type="button" onClick={onBack} className="text-paper">
          Zurück
        </button>
      </div>
    );
  }

  function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    void send(id, text).finally(() => setSending(false));
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" aria-label="Zurück" onClick={onBack} className="grid size-11 place-items-center text-paper">
          <ArrowLeft className="size-5" />
        </button>
        <Portrait
          src={thread.photo}
          name={thread.person.name}
          veiled={!thread.unveiled}
          className="size-11 rounded-full"
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-paper">{thread.person.name}</p>
          <p className="text-xs text-muted">{thread.unveiled ? "Schleier gefallen" : "Schleier liegt"}</p>
        </div>
        <SafetyMenu personId={thread.person.id} name={thread.person.name} onDone={onBack} />
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {thread.unveiled && thread.photo && (
          <div className="px-4 py-2 text-center">
            <p className="text-xs tracking-widest text-ember">SCHLEIER GEFALLEN</p>
            <img src={thread.photo} alt="" className="mx-auto mt-3 size-28 rounded-2xl object-cover" />
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.from === "me" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-xs rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                message.from === "me" ? "bg-ember text-ink" : "border border-line bg-surface text-paper",
              )}
            >
              {message.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {!thread.unveiled && (
        <p className="px-4 pb-2 text-center text-xs text-muted">
          <span className="tabular-nums">
            Du {Math.min(mine, VEIL_AFTER)}/{VEIL_AFTER} · {thread.person.name} {Math.min(theirs, VEIL_AFTER)}/
            {VEIL_AFTER}
          </span>
          <br />
          {need > 0
            ? `Noch ${need} ${need === 1 ? "Nachricht" : "Nachrichten"} von dir. Der Schleier fällt, wenn ihr beide ${VEIL_AFTER} geschrieben habt.`
            : `Jetzt ist ${thread.person.name} dran. Der Schleier fällt, wenn ihr beide ${VEIL_AFTER} geschrieben habt.`}
        </p>
      )}
      {mine < VEIL_AFTER && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {ICEBREAKERS.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => setDraft(line)}
              className="h-11 shrink-0 rounded-full bg-surface px-3 text-sm text-paper"
            >
              {line}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex gap-2 border-t border-line p-3 pb-safe"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Schreib, nicht swipen"
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base text-paper outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="h-12 shrink-0 rounded-full bg-ember px-4 text-sm font-medium text-ink disabled:opacity-40"
        >
          Senden
        </button>
      </form>
    </div>
  );
}

export function PersonView({
  id,
  onBack,
  onSpark,
}: {
  id: string;
  onBack: () => void;
  onSpark: (personId: string, promptId: string) => void;
}) {
  const person = useVela((state) => state.person(id));
  const me = useVela((state) => state.me);
  if (!person || !me) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <button type="button" onClick={onBack} className="text-paper">
          Zurück
        </button>
      </div>
    );
  }
  const parts = resonanceParts(me, person);
  const score = parts.score;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-2 pt-2">
        <button type="button" aria-label="Zurück" onClick={onBack} className="grid size-11 place-items-center text-paper">
          <ArrowLeft className="size-5" />
        </button>
        <p className="text-sm text-muted">Profil unter dem Schleier</p>
        <SafetyMenu personId={person.id} name={person.name} onDone={onBack} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <Portrait name={person.name} veiled className="h-56 w-full rounded-3xl" />
        <h1 className="mt-5 font-display text-4xl text-paper">
          {person.name}, {person.age}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {person.city} · {orbitLabel(person.orbit)} · Resonanz {score}
        </p>
        <p className="mt-3 text-sm text-muted">{person.values.join(" · ")}</p>
        <details className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
          <summary className="cursor-pointer text-paper">So entsteht die Resonanz {score}</summary>
          <p className="mt-2">
            {RESONANCE.base} Basis + {parts.sharedValues.length} gemeinsame{" "}
            {parts.sharedValues.length === 1 ? "Wert" : "Werte"} × {RESONANCE.perValue} +{" "}
            {parts.sameOrbit ? `${RESONANCE.sameOrbit} (gleicher Orbit)` : `${RESONANCE.otherOrbit} (anderer Orbit)`} ={" "}
            {parts.raw}
            {parts.raw !== score ? `, begrenzt auf ${RESONANCE.min}–${RESONANCE.max}: ${score}` : ""}.
          </p>
          {parts.sharedValues.length > 0 ? (
            <p className="mt-1">Gemeinsam: {parts.sharedValues.join(" · ")}</p>
          ) : null}
          <p className="mt-2 text-faint">
            Eine feste, offene Formel für alle. Keine KI, Fotos zählen nicht. Der Code ist öffentlich.
          </p>
        </details>
        <div className="mt-6 grid gap-3">
          {person.prompts.map((prompt) => (
            <div key={prompt.id} className="rounded-2xl bg-surface p-4">
              <p className="text-xs tracking-widest text-muted uppercase">{prompt.q}</p>
              <p className="mt-2 font-display text-2xl leading-snug text-paper">{prompt.a}</p>
              <button
                type="button"
                onClick={() => onSpark(person.id, prompt.id)}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ember px-4 text-sm font-medium text-ink"
              >
                <Flame className="size-4" />
                Darauf funken
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function downloadMyData() {
  const data = await exportMyData();
  const name = `vela-daten-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([data], { type: "application/json" });
  // In the store apps a download link does nothing; hand the file to the share sheet.
  const file = typeof File === "function" ? new File([blob], name, { type: "application/json" }) : null;
  if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }) && isNativeApp()) {
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

export function MeScreen({ onPlus }: { onPlus: () => void }) {
  const me = useVela((state) => state.me);
  const plus = useVela((state) => state.plus);
  const left = useVela((state) => state.swipesLeft);
  const save = useVela((state) => state.save);
  const removeProfile = useVela((state) => state.removeProfile);
  const [draft, setDraft] = useState(me);
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setDraft(me);
  }, [me]);

  if (!draft) return null;
  const profile = draft;

  function patch(partial: Partial<NonNullable<typeof draft>>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
    setNote("");
  }

  function toggleValue(value: string) {
    const has = profile.values.includes(value);
    if (has) patch({ values: profile.values.filter((item) => item !== value) });
    else if (profile.values.length < 3) patch({ values: [...profile.values, value] });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
      <h1 className="font-display text-4xl text-paper">Du</h1>
      <div className="mt-5 flex items-center gap-4">
        {draft.photo ? (
          <img src={draft.photo} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-ember font-display text-2xl text-ink">
            {draft.name.slice(0, 1) || "?"}
          </div>
        )}
        <div>
          <p className="font-display text-2xl text-paper">{draft.name || "Ohne Namen"}</p>
          <p className="text-sm text-muted">
            {left === null ? "Swipes unbegrenzt" : `${left} Swipes heute`}
            {plus ? " · Vela+" : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <label>
          <FieldLabel>Vorname</FieldLabel>
          <TextInput value={draft.name} onChange={(name) => patch({ name })} />
        </label>
        <label>
          <FieldLabel>Stadt</FieldLabel>
          <TextInput value={draft.city} onChange={(city) => patch({ city })} />
        </label>
      </div>

      <p className="mt-6 mb-2 text-xs tracking-widest text-muted uppercase">Orbit</p>
      <div className="flex flex-wrap gap-2">
        {ORBITS.map((orbit) => (
          <button
            key={orbit.id}
            type="button"
            onClick={() => patch({ orbit: orbit.id as Orbit })}
            className={cn(
              "h-11 rounded-full px-4 text-sm",
              draft.orbit === orbit.id ? "bg-paper text-ink" : "bg-surface text-muted",
            )}
          >
            {orbit.label}
          </button>
        ))}
      </div>

      <p className="mt-6 mb-2 text-xs tracking-widest text-muted uppercase">Was bleibt</p>
      <div className="flex flex-wrap gap-2">
        {VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleValue(value)}
            className={cn(
              "h-11 rounded-full px-4 text-sm",
              draft.values.includes(value) ? "bg-ember text-ink" : "bg-surface text-paper",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3">
        {draft.prompts.map((prompt, index) => (
          <label key={prompt.id} className="block rounded-2xl bg-surface p-4">
            <span className="text-xs tracking-widest text-muted uppercase">{prompt.q}</span>
            <textarea
              value={prompt.a}
              rows={3}
              onChange={(event) =>
                patch({
                  prompts: draft.prompts.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, a: event.target.value } : item,
                  ),
                })
              }
              className="mt-2 w-full resize-none bg-transparent text-base text-paper outline-none"
            />
          </label>
        ))}
      </div>

      {note && <p className="mt-4 text-sm text-ember">{note}</p>}
      <div className="mt-4">
        <PrimaryButton
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void save(draft).then((failed) => {
              setBusy(false);
              setNote(failed ?? "Gespeichert.");
            });
          }}
        >
          {busy ? "Speichert…" : "Speichern"}
        </PrimaryButton>
      </div>

      <button type="button" onClick={onPlus} className="mt-6 w-full rounded-3xl bg-surface p-4 text-left">
        <span className="text-xs tracking-widest text-ember">VELA+</span>
        <span className="mt-1 block font-display text-2xl text-paper">
          {plus ? "Aktiv" : "Mehr Signale. Kein gekauftes Gesicht."}
        </span>
      </button>

      <div className="mt-6">
        <UserButton />
      </div>

      <button
        type="button"
        disabled={exporting}
        onClick={() => {
          setExporting(true);
          void downloadMyData()
            .then(() => setNote("Export erstellt."))
            .catch(() => setNote("Export ging gerade nicht. Versuch es gleich nochmal."))
            .finally(() => setExporting(false));
        }}
        className="mt-6 block h-11 text-sm text-muted"
      >
        {exporting ? "Export wird erstellt…" : "Meine Daten herunterladen"}
      </button>

      <button
        type="button"
        onClick={() => {
          if (arm) void removeProfile();
          else setArm(true);
        }}
        className="mt-2 h-11 text-sm text-muted"
      >
        {arm ? "Konto wirklich löschen" : "Konto löschen"}
      </button>
      <p className="mt-2 text-sm text-muted">
        Löscht dein Profil, deinen Login, deine Swipes und die Nachrichten, an denen du beteiligt bist. Meldungen
        bewahren wir zum Schutz anderer bis zu 12 Monate auf.
      </p>
      <LegalLinks className="mt-8" />
    </div>
  );
}

export function Plus({ onBack }: { onBack: () => void }) {
  const plus = useVela((state) => state.plus);
  const unlockPlus = useVela((state) => state.unlockPlus);
  const plusAvailable = useVela((state) => state.plusAvailable);
  const billing = useVela((state) => state.billing);
  const checkoutPlus = useVela((state) => state.checkoutPlus);
  const managePlus = useVela((state) => state.managePlus);
  const [busy, setBusy] = useState(false);
  // Store apps (iOS/Android): no Stripe checkout and no link to it. Apple 3.1.1
  // and Google Play Billing require in-app purchase for digital subscriptions,
  // which is not wired up yet. Existing subscribers still get Plus.
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const periodEnd = billing.periodEnd
    ? new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(billing.periodEnd),
      )
    : null;
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    const error = await action();
    // On success the page navigates to Stripe; keep the button disabled meanwhile.
    if (error) setBusy(false);
  };
  const features = [
    { icon: Eye, title: "Wer schon wartet", line: "Sieh die Menschen, die im Stillen zurückfunken würden." },
    { icon: Flame, title: "Unbegrenzte Swipes", line: "Kostenlos 12 am Tag, links oder rechts. Vela+ hört nicht auf." },
    { icon: Undo2, title: "Einen Schritt zurück", line: "Die letzte Weiter-Geste holst du dir wieder." },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-2 pt-2">
        <button type="button" aria-label="Zurück" onClick={onBack} className="grid size-11 place-items-center text-paper">
          <ArrowLeft className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <p className="text-xs tracking-widest text-ember">VELA+</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-paper">
          Mehr Signale. Kein gekauftes Gesicht.
        </h1>
        <p className="mt-4 text-base text-muted">
          Das Abo öffnet, wer schon auf deine Art anspringt. Den Schleier hebt nur ein Gespräch.
        </p>
        <ul className="mt-6 grid gap-3">
          {features.map((feature) => (
            <li key={feature.title} className="flex gap-3 rounded-2xl bg-surface p-4">
              <feature.icon className="mt-0.5 size-5 shrink-0 text-ember" />
              <span>
                <span className="block font-medium text-paper">{feature.title}</span>
                <span className="mt-1 block text-sm text-muted">{feature.line}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 font-display text-4xl text-paper tabular-nums">
          {PLUS_PRICE_LABEL} <span className="font-sans text-base text-muted">/ Monat, jederzeit kündbar</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {plusAvailable
            ? "In dieser Vorschau ohne Abbuchung."
            : native
              ? "In der App kommt Vela+ bald."
              : "Mit Karte, Apple Pay oder Google Pay. Die Zahlung läuft sicher über Stripe."}
        </p>
        <div className="mt-6 grid gap-3">
          {plus ? (
            <>
              <p className="rounded-full bg-surface py-3 text-center text-sm text-paper">Vela+ ist aktiv</p>
              {periodEnd && (
                <p className="text-center text-sm text-muted">
                  {billing.cancelAtPeriodEnd ? `Gekündigt, läuft bis ${periodEnd}.` : `Verlängert sich am ${periodEnd}.`}
                  {billing.status === "past_due" ? " Die letzte Zahlung hat nicht geklappt." : ""}
                </p>
              )}
              {billing.customer && billing.configured && !native && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(managePlus)}
                  className="h-12 rounded-full border border-line text-base text-paper disabled:opacity-50"
                >
                  {busy ? "Öffne …" : "Abo verwalten"}
                </button>
              )}
            </>
          ) : plusAvailable ? (
            <PrimaryButton onClick={() => void unlockPlus()}>In der Vorschau freischalten</PrimaryButton>
          ) : native ? (
            <p className="rounded-full bg-surface px-4 py-3 text-center text-sm text-muted">
              Vela+ lässt sich in der App noch nicht abschließen.
            </p>
          ) : billing.configured ? (
            <>
              <PrimaryButton disabled={busy} onClick={() => void run(checkoutPlus)}>
                {busy ? "Öffne Bezahlseite …" : `Vela+ holen · ${PLUS_PRICE_LABEL} / Monat`}
              </PrimaryButton>
              <p className="text-xs text-muted">
                Mit dem Kauf akzeptierst du die{" "}
                <a href="/agb" className="underline underline-offset-4">
                  Abo-Bedingungen
                </a>{" "}
                und verlangst, dass Vela+ sofort startet. Kündigen geht jederzeit zum Ende des Monats.
              </p>
              {billing.customer && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(managePlus)}
                  className="h-11 text-sm text-muted underline-offset-4 hover:underline"
                >
                  Abo verwalten
                </button>
              )}
            </>
          ) : (
            <p className="rounded-full bg-surface px-4 py-3 text-center text-sm text-muted">
              Zahlungen sind noch nicht eingerichtet.
            </p>
          )}
        </div>
        {!native && (
          <div className="mt-8 rounded-3xl border border-line p-4">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-ember" />
            <p className="font-medium text-paper">iPhone und Android</p>
          </div>
          <p className="mt-3 text-sm text-muted">
            Vela ist die Handy-App. Auf dem iPhone landet sie über die Installationsschritte auf dem
            Home-Bildschirm, auf Android über „App installieren“ im Browser-Menü.
          </p>
          <a
            href="/?install=1&platform=ios"
            className="mt-4 flex h-12 items-center justify-center rounded-full border border-line text-base text-paper"
          >
            Auf dem iPhone installieren
          </a>
          <p className="mt-4 text-sm text-muted">
            App Store und Play Store brauchen ein Entwicklerkonto bei Apple und bei Google. Die
            Freigabe läuft darüber, nicht in dieser Vorschau. Die App und die Swipe-Regeln sind
            dieselben.
          </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Celebrate({
  name,
  mine,
  onWrite,
  onLater,
}: {
  name: string;
  mine: string;
  onWrite: () => void;
  onLater: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-bg/92 px-8 text-center">
      <div className="flex items-center">
        <div className="grid size-20 place-items-center rounded-full border-2 border-bg bg-ember font-display text-3xl text-ink">
          {mine.slice(0, 1)}
        </div>
        <Portrait name={name} veiled className="-ml-4 size-20 rounded-full border-2 border-bg" />
      </div>
      <p className="mt-8 text-xs tracking-widest text-ember">ES KLINGT</p>
      <h2 className="mt-3 font-display text-5xl text-paper">Du & {name}</h2>
      <p className="mt-4 max-w-xs text-muted">Der Schleier bleibt. Schreibt erst. Dann seht ihr euch.</p>
      <div className="mt-8 w-full max-w-xs">
        <PrimaryButton onClick={onWrite}>Schreiben</PrimaryButton>
        <button type="button" onClick={onLater} className="mt-3 h-11 w-full text-sm text-muted">
          Später
        </button>
      </div>
    </div>
  );
}

export function Nav({
  tab,
  unread,
  onChange,
}: {
  tab: "discover" | "signals" | "me";
  unread: number;
  onChange: (tab: "discover" | "signals" | "me") => void;
}) {
  const items = [
    { id: "discover" as const, label: "Entdecken", icon: Compass },
    { id: "signals" as const, label: "Signale", icon: MessageCircle },
    { id: "me" as const, label: "Du", icon: UserRound },
  ];
  return (
    <nav className="flex border-t border-line pb-safe">
      {items.map((item) => {
        const active = tab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs",
              active ? "font-medium text-paper" : "text-muted",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.id === "signals" && unread > 0 && (
                <span className="absolute -top-1 -right-3 min-w-4 rounded-full bg-ember px-1 text-center text-xs leading-4 text-ink tabular-nums">
                  {unread}
                </span>
              )}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
