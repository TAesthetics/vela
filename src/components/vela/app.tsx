import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useVela } from "@/lib/vela/store";
import { Frame, Wordmark } from "@/components/vela/ui";
import { Onboarding } from "@/components/vela/onboarding";
import { Discover } from "@/components/vela/discover";
import { Celebrate, Chat, MeScreen, Nav, PersonView, Plus, Signals } from "@/components/vela/flows";
import { SignInPanel } from "@/components/vela/signin";
import { Suspended } from "@/components/vela/suspended";

type Tab = "discover" | "signals" | "me";
type Screen =
  | { name: "tabs" }
  | { name: "chat"; id: string }
  | { name: "plus" }
  | { name: "person"; id: string };

function Veil() {
  return (
    <Frame>
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="text-center">
          <Wordmark />
          <p className="mt-3 text-sm text-muted">Der Schleier liegt.</p>
        </div>
      </div>
    </Frame>
  );
}

export function VelaApp() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Veil />;
  if (!user) {
    return (
      <Frame>
        <div className="flex min-h-0 flex-1 flex-col px-6 py-8">
          <SignInPanel />
        </div>
      </Frame>
    );
  }
  return <Authed />;
}

function Authed() {
  const ready = useVela((state) => state.ready);
  const me = useVela((state) => state.me);
  const suspension = useVela((state) => state.suspension);
  const toast = useVela((state) => state.toast);
  const clearToast = useVela((state) => state.clearToast);
  const celebrate = useVela((state) => state.celebrate);
  const dismissCelebrate = useVela((state) => state.dismissCelebrate);
  const spark = useVela((state) => state.spark);
  const threads = useVela((state) => state.threads);
  const seen = useVela((state) => state.seen);
  const load = useVela((state) => state.load);
  const [tab, setTab] = useState<Tab>("discover");
  const [screen, setScreen] = useState<Screen>({ name: "tabs" });

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  // Back from Stripe Checkout / billing portal (?plus=success|cancel|portal).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("plus");
    if (!result) return;
    url.searchParams.delete("plus");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setScreen({ name: "plus" });
    if (result === "success") {
      useVela.setState({ toast: "Danke! Vela+ wird gleich aktiv." });
      // The webhook usually lands within seconds; reload a few times to pick it up.
      const timers = [2000, 5000, 10000].map((ms) =>
        window.setTimeout(() => void load().catch(() => undefined), ms),
      );
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (result === "cancel") useVela.setState({ toast: "Kein Problem, es wurde nichts abgebucht." });
    if (result === "portal") void load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(), 2600);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  if (!ready) return <Veil />;

  if (suspension) {
    return (
      <Frame overlay={toast ? <div role="status" className="pointer-events-none absolute inset-x-5 top-5 z-50 rounded-full bg-paper px-4 py-3 text-center text-sm text-ink">{toast}</div> : null}>
        <Suspended suspension={suspension} />
      </Frame>
    );
  }

  if (!me?.onboarded) {
    return (
      <Frame>
        <Onboarding />
      </Frame>
    );
  }

  const unread = threads.reduce((count, thread) => {
    return count + (thread.messages.length > (seen[thread.person.id] ?? 0) ? 1 : 0);
  }, 0);

  const overlay = (
    <>
      {toast && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-5 top-5 z-50 rounded-full bg-paper px-4 py-3 text-center text-sm text-ink"
        >
          {toast}
        </div>
      )}
      {celebrate && (
        <Celebrate
          name={celebrate.name}
          mine={me.name || "Du"}
          onLater={dismissCelebrate}
          onWrite={() => {
            dismissCelebrate();
            setScreen({ name: "chat", id: celebrate.id });
          }}
        />
      )}
    </>
  );

  return (
    <Frame
      nav={
        screen.name === "tabs" ? (
          <Nav
            tab={tab}
            unread={unread}
            onChange={(next) => {
              setTab(next);
              setScreen({ name: "tabs" });
            }}
          />
        ) : null
      }
      overlay={overlay}
    >
      {screen.name === "chat" && <Chat id={screen.id} onBack={() => setScreen({ name: "tabs" })} />}
      {screen.name === "plus" && <Plus onBack={() => setScreen({ name: "tabs" })} />}
      {screen.name === "person" && (
        <PersonView
          id={screen.id}
          onBack={() => setScreen({ name: "tabs" })}
          onSpark={(personId, promptId) => {
            void spark(personId, promptId, "").then((result) => {
              if (result === "limit") setScreen({ name: "plus" });
              else setScreen({ name: "tabs" });
            });
          }}
        />
      )}
      {screen.name === "tabs" && tab === "discover" && (
        <Discover onOpenPerson={(id) => setScreen({ name: "person", id })} onPlus={() => setScreen({ name: "plus" })} />
      )}
      {screen.name === "tabs" && tab === "signals" && (
        <Signals
          onChat={(id) => setScreen({ name: "chat", id })}
          onPerson={(id) => setScreen({ name: "person", id })}
          onPlus={() => setScreen({ name: "plus" })}
        />
      )}
      {screen.name === "tabs" && tab === "me" && <MeScreen onPlus={() => setScreen({ name: "plus" })} />}
    </Frame>
  );
}
