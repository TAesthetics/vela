import type { ReactNode } from "react";
import { useState } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Wordmark() {
  return (
    <span className="font-display text-2xl tracking-wide text-paper">
      Vela
      <span className="ml-1 inline-block size-1.5 rounded-full bg-ember align-super" />
    </span>
  );
}

export function Portrait({
  src,
  name,
  veiled,
  className,
}: {
  src?: string | null;
  name: string;
  veiled: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)}>
      {showImage ? (
        <img
          src={src ?? ""}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className={cn("portrait-img h-full w-full object-cover", veiled && "portrait-veil")}
        />
      ) : (
        <div className="grid h-full w-full place-items-center font-display text-3xl text-muted">
          {name.slice(0, 1)}
        </div>
      )}
      {veiled && <div className="pointer-events-none absolute inset-0 bg-bg/35" />}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="h-12 w-full rounded-full bg-ember text-base font-medium text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 w-full rounded-full border border-line text-base text-paper"
    >
      {children}
    </button>
  );
}

export function RoundButton({
  label,
  onClick,
  children,
  tone = "ghost",
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "ghost" | "ember";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid place-items-center rounded-full",
        tone === "ember" ? "size-16 bg-ember text-ink" : "size-12 border border-line bg-surface text-paper",
        disabled && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-xs tracking-widest text-muted uppercase">{children}</span>;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <input
      value={value}
      type={type}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-paper outline-none placeholder:text-muted"
    />
  );
}

const PRINCIPLES = [
  { n: "01", title: "Satz vor Selfie", line: "Du funkst auf einen Gedanken, nicht auf ein Gesicht." },
  { n: "02", title: "Schleier", line: "Das Porträt bleibt weich, bis ihr wirklich geschrieben habt." },
  { n: "03", title: "Ein Orbit", line: "Langsam, Abenteuer, Tiefgang, leicht oder echt. Absicht zuerst." },
];

export function Frame({
  children,
  nav,
  overlay,
}: {
  children: ReactNode;
  nav?: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg text-paper">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl lg:grid-cols-2">
        <aside className="hidden h-dvh flex-col justify-between px-14 py-16 lg:flex">
          <div>
            <Wordmark />
            <h1 className="mt-10 max-w-md font-display text-5xl leading-tight text-paper">
              Erst der Satz. Dann das Gesicht.
            </h1>
            <p className="mt-6 max-w-sm text-base text-muted">
              Vela ist das Dating, das das Foto zurückhält. Chemie vor dem Close-up. Ein Abo kann
              Signale öffnen. Ein Gesicht nicht.
            </p>
          </div>
          <div className="max-w-md">
            {PRINCIPLES.map((item) => (
              <div key={item.n} className="border-t border-line py-4">
                <p className="text-xs tracking-widest text-muted">{item.n}</p>
                <p className="mt-1 font-display text-2xl text-paper">{item.title}</p>
                <p className="mt-1 text-sm text-muted">{item.line}</p>
              </div>
            ))}
            <blockquote className="mt-8 border-l-2 border-ember pl-4">
              <p className="font-display text-2xl leading-snug text-paper">
                Ein falsches Komma kann einen ganzen Menschen verschieben.
              </p>
              <p className="mt-3 text-sm text-muted">Lena, 28 · Lektorin · noch unter dem Schleier</p>
            </blockquote>
          </div>
        </aside>
        <div className="relative mx-auto flex h-dvh w-full min-w-0 max-w-lg flex-col overflow-hidden lg:max-w-none lg:border-l lg:border-line">
          {children}
          {nav}
          {overlay}
        </div>
      </div>
    </div>
  );
}
