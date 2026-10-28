import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/components/vela/ui";

export { OPERATOR } from "@/lib/vela/legal-info";

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Rechtliches" className={cn("flex gap-4 text-xs text-muted", className)}>
      <Link to="/datenschutz" className="underline-offset-4 hover:underline">
        Datenschutz
      </Link>
      <Link to="/impressum" className="underline-offset-4 hover:underline">
        Impressum
      </Link>
    </nav>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl bg-bg px-6 py-10 text-paper">
      <Link to="/" className="text-sm text-muted underline-offset-4 hover:underline">
        ← Zurück zu Vela
      </Link>
      <h1 className="mt-6 font-display text-4xl">{title}</h1>
      <div className="legal mt-8 grid gap-6 text-sm leading-relaxed text-paper/90">{children}</div>
      <LegalLinks className="mt-12" />
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-display text-xl text-paper">{title}</h2>
      {children}
    </section>
  );
}
