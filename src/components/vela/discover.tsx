import { useEffect, useRef, useState } from "react";
import { EyeOff, Flame, Lock, PenLine, Undo2, X } from "lucide-react";
import {
  ORBITS,
  orbitLabel,
  resonance,
  type Orbit,
  type Person,
} from "@/lib/vela/data";
import { useVela } from "@/lib/vela/store";
import { Portrait, PrimaryButton, RoundButton, Wordmark, cn } from "@/components/vela/ui";

type Fly = "left" | "right" | null;

export function Discover({
  onOpenPerson,
  onPlus,
}: {
  onOpenPerson: (id: string) => void;
  onPlus: () => void;
}) {
  const me = useVela((state) => state.me);
  const people = useVela((state) => state.deck);
  const others = useVela((state) => state.others);
  const lastPassId = useVela((state) => state.lastPassId);
  const frontId = useVela((state) => state.frontId);
  const plus = useVela((state) => state.plus);
  const left = useVela((state) => state.swipesLeft);
  const seenCoach = useVela((state) => state.seenCoach);
  const celebrate = useVela((state) => state.celebrate);
  const pass = useVela((state) => state.pass);
  const undo = useVela((state) => state.undo);
  const spark = useVela((state) => state.spark);
  const load = useVela((state) => state.load);
  const dismissCoach = useVela((state) => state.dismissCoach);

  const [filter, setFilter] = useState<Orbit | "all">("all");
  const [fly, setFly] = useState<Fly>(null);
  const [sheet, setSheet] = useState(false);
  const pending = useRef<{ promptId: string; note: string } | null>(null);

  let deck = people.filter((person) => filter === "all" || person.orbit === filter);
  if (frontId) {
    const focused = deck.find((person) => person.id === frontId);
    if (focused) deck = [focused, ...deck.filter((person) => person.id !== frontId)];
  }
  const top = deck[0];
  const topRef = useRef(top);
  topRef.current = top;

  function requestPass() {
    if (fly || !topRef.current) return;
    if (left === 0) {
      onPlus();
      return;
    }
    setSheet(false);
    setFly("left");
  }

  function requestSpark(promptId: string, note: string) {
    if (fly || !topRef.current) return;
    if (left === 0) {
      onPlus();
      return;
    }
    pending.current = { promptId, note };
    setSheet(false);
    setFly("right");
  }

  function onDone(dir: "left" | "right") {
    const person = topRef.current;
    setFly(null);
    if (!person) return;
    if (dir === "left") {
      void pass(person.id).then((result) => {
        if (result === "limit") onPlus();
      });
      return;
    }
    const choice = pending.current;
    pending.current = null;
    void spark(person.id, choice?.promptId ?? person.prompts[0].id, choice?.note ?? "").then((result) => {
      if (result === "limit") onPlus();
    });
  }

  const api = useRef({ requestPass, requestSpark, sheet: false, blocked: false });
  api.current = { requestPass, requestSpark, sheet, blocked: Boolean(celebrate) };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (api.current.sheet || api.current.blocked) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      if (event.key === "ArrowLeft") api.current.requestPass();
      else if (topRef.current) api.current.requestSpark(topRef.current.prompts[0].id, "");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <Wordmark />
        <button
          type="button"
          onClick={onPlus}
          className="h-11 rounded-full bg-surface px-4 text-sm text-paper tabular-nums"
        >
          {left === null ? "Unbegrenzt" : `${left} Swipes`}
        </button>
      </header>
      <div className="no-scrollbar flex w-full min-w-0 gap-2 overflow-x-auto px-5 pb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Alle
        </FilterChip>
        {ORBITS.map((orbit) => (
          <FilterChip key={orbit.id} active={filter === orbit.id} onClick={() => setFilter(orbit.id)}>
            {orbit.label}
          </FilterChip>
        ))}
      </div>
      {!seenCoach && top && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-2xl bg-surface px-4 py-3">
          <p className="pt-1 text-sm text-paper">
            Rechts funken, links weiter. Das Gesicht kommt erst im Chat.
          </p>
          <button
            type="button"
            aria-label="Hinweis schließen"
            onClick={dismissCoach}
            className="grid size-11 shrink-0 place-items-center text-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {top ? (
        <>
          <div className="relative min-h-0 flex-1 px-4 pb-3">
            {deck[1] && (
              <div className="pointer-events-none absolute inset-x-7 top-0 h-full rounded-3xl bg-surface" style={{ transform: "translateY(14px) scale(0.96)" }} />
            )}
            <SwipeCard
              key={top.id}
              person={top}
              score={me ? resonance(me, top) : 50}
              fly={fly}
              onOpen={() => onOpenPerson(top.id)}
              onDone={onDone}
              onGesture={(dir) => {
                if (dir === "left") requestPass();
                else requestSpark(top.prompts[0].id, "");
              }}
            />
          </div>
          <div className="flex items-center justify-center gap-4 px-5 pt-1 pb-4">
            <RoundButton
              label={plus ? "Rückgängig" : "Rückgängig mit Vela+"}
              disabled={plus && !lastPassId}
              onClick={() => {
                if (!plus) onPlus();
                else void undo();
              }}
            >
              {plus ? <Undo2 className="size-5" /> : <Lock className="size-4" />}
            </RoundButton>
            <RoundButton label="Weiter" onClick={requestPass}>
              <X className="size-6" />
            </RoundButton>
            <RoundButton
              label="Auf diesen Satz funken"
              tone="ember"
              onClick={() => requestSpark(top.prompts[0].id, "")}
            >
              <Flame className="size-7" />
            </RoundButton>
            <RoundButton label="Mit Notiz funken" onClick={() => (left === 0 ? onPlus() : setSheet(true))}>
              <PenLine className="size-5" />
            </RoundButton>
          </div>
        </>
      ) : (
        <EmptyDeck
          filtered={filter !== "all"}
          alone={others === 0}
          onRefresh={() => void load()}
          onAll={() => setFilter("all")}
        />
      )}
      {sheet && top && (
        <NoteSheet
          person={top}
          onClose={() => setSheet(false)}
          onSend={(promptId, note) => requestSpark(promptId, note)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-full px-4 text-sm",
        active ? "bg-paper text-ink" : "bg-surface text-muted",
      )}
    >
      {children}
    </button>
  );
}

function EmptyDeck({
  filtered,
  alone,
  onRefresh,
  onAll,
}: {
  filtered: boolean;
  alone: boolean;
  onRefresh: () => void;
  onAll: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center px-6">
      <p className="font-display text-4xl text-paper">Der Orbit ist still.</p>
      <p className="mt-3 max-w-xs text-muted">
        {alone
          ? "Noch niemand sonst hat ein Profil. Sobald jemand dazukommt, liegt die Person hier."
          : filtered
            ? "In diesem Orbit ist gerade niemand. Versuch einen anderen."
            : "Du hast alle gesehen. Neue Profile tauchen hier auf, sobald jemand beitritt."}
      </p>
      <div className="mt-6">
        {filtered ? (
          <PrimaryButton onClick={onAll}>Alle Orbits</PrimaryButton>
        ) : (
          <PrimaryButton onClick={onRefresh}>Aktualisieren</PrimaryButton>
        )}
      </div>
    </div>
  );
}

function SwipeCard({
  person,
  score,
  fly,
  onOpen,
  onDone,
  onGesture,
}: {
  person: Person;
  score: number;
  fly: Fly;
  onOpen: () => void;
  onDone: (dir: "left" | "right") => void;
  onGesture: (dir: "left" | "right") => void;
}) {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const fired = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const flyRef = useRef(fly);
  flyRef.current = fly;
  const hero = person.prompts[0];

  useEffect(() => {
    if (!fly) {
      fired.current = false;
      point.current = { x: 0, y: 0 };
      setX(0);
      setY(0);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      if (fired.current) return;
      fired.current = true;
      doneRef.current(fly);
    };
    if (reduce) {
      finish();
      return;
    }
    setDragging(false);
    point.current = { x: fly === "left" ? -560 : 560, y: 18 };
    setX(fly === "left" ? -560 : 560);
    setY(18);
    const timer = window.setTimeout(finish, 420);
    return () => window.clearTimeout(timer);
  }, [fly]);

  return (
    <article
      aria-label={`${person.name}, ${person.age}. ${hero.q}. ${hero.a}. Porträt noch verhüllt.`}
      onPointerDown={(event) => {
        if (flyRef.current) return;
        origin.current = { x: event.clientX, y: event.clientY };
        draggingRef.current = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!origin.current || !draggingRef.current) return;
        const next = {
          x: event.clientX - origin.current.x,
          y: (event.clientY - origin.current.y) * 0.22,
        };
        point.current = next;
        setX(next.x);
        setY(next.y);
      }}
      onPointerUp={() => {
        if (!origin.current) return;
        const dx = point.current.x;
        const dy = point.current.y;
        origin.current = null;
        draggingRef.current = false;
        setDragging(false);
        if (Math.hypot(dx, dy) < 12) {
          point.current = { x: 0, y: 0 };
          setX(0);
          setY(0);
          onOpen();
          return;
        }
        if (dx > 108) onGesture("right");
        else if (dx < -108) onGesture("left");
        else {
          point.current = { x: 0, y: 0 };
          setX(0);
          setY(0);
        }
      }}
      onPointerCancel={() => {
        origin.current = null;
        draggingRef.current = false;
        point.current = { x: 0, y: 0 };
        setDragging(false);
        setX(0);
        setY(0);
      }}
      style={{
        transform: `translate3d(${x}px, ${y}px, 0) rotate(${x / 22}deg)`,
        transition: dragging ? "none" : "transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
      className="relative z-10 flex h-full min-h-0 touch-none flex-col overflow-hidden rounded-3xl bg-paper text-ink select-none"
    >
      <div
        className="pointer-events-none absolute top-8 left-5 z-20 -rotate-12 rounded-md border-2 border-ember px-2 py-1 font-display text-2xl text-ember"
        style={{ opacity: Math.max(0, Math.min(1, x / 110)) }}
      >
        Funk
      </div>
      <div
        className="pointer-events-none absolute top-8 right-5 z-20 rotate-12 rounded-md border-2 border-faint px-2 py-1 font-display text-2xl text-faint"
        style={{ opacity: Math.max(0, Math.min(1, -x / 110)) }}
      >
        Weiter
      </div>
      <div className="relative min-h-0 flex-1">
        <Portrait name={person.name} veiled className="absolute inset-0 h-full w-full" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-bg/75 px-3 py-1.5 text-xs text-paper">
          <EyeOff className="size-3.5" />
          Schleier
        </div>
        <div className="absolute top-3 right-3 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink tabular-nums">
          Resonanz {score}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-bg/75 px-5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-3xl text-paper">
              {person.name}, {person.age}
            </h2>
            <span className="shrink-0 text-sm text-muted">{orbitLabel(person.orbit)}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {person.city}
            {person.sparkedYou ? " · hat schon gefunkt" : ""}
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper/20">
            <div className="h-full bg-ember" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
      <div className="shrink-0 px-5 py-4">
        <p className="text-xs tracking-widest text-faint uppercase">{hero.q}</p>
        <p className="mt-2 font-display text-2xl leading-snug text-ink">{hero.a}</p>
        <p className="mt-3 text-xs text-faint">
          Die Flamme gilt diesem Satz · Tippen öffnet das Profil
        </p>
      </div>
    </article>
  );
}

function NoteSheet({
  person,
  onClose,
  onSend,
}: {
  person: Person;
  onClose: () => void;
  onSend: (promptId: string, note: string) => void;
}) {
  const [promptId, setPromptId] = useState(person.prompts[0].id);
  const [note, setNote] = useState("");
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-bg/80">
      <button type="button" aria-label="Schließen" className="min-h-16 flex-1" onClick={onClose} />
      <div className="max-h-full overflow-y-auto rounded-t-3xl bg-surface px-5 pt-4 pb-safe">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h2 className="font-display text-3xl text-paper">Worauf funkst du?</h2>
        <p className="mt-2 mb-4 text-sm text-muted">Eine Notiz ist optional. Ein Satz von {person.name} nicht.</p>
        <div className="grid gap-2">
          {person.prompts.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => setPromptId(prompt.id)}
              className={cn(
                "rounded-2xl border px-4 py-3 text-left",
                promptId === prompt.id ? "border-ember" : "border-line",
              )}
            >
              <span className="block text-xs tracking-widest text-muted uppercase">{prompt.q}</span>
              <span className="mt-1 block font-display text-lg leading-snug text-paper">{prompt.a}</span>
            </button>
          ))}
        </div>
        <textarea
          value={note}
          rows={3}
          maxLength={180}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Eine Zeile dazu. Oder leer lassen."
          className="mt-4 w-full resize-none rounded-2xl border border-line bg-bg px-4 py-3 text-base text-paper outline-none placeholder:text-muted"
        />
        <div className="mt-4 pb-4">
          <PrimaryButton onClick={() => onSend(promptId, note)}>Funken</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
