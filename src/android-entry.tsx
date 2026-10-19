import { Component, type ReactNode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { StudioLogo } from "@/components/studio/StudioLogo";
import "@/styles.css";

const BuddyLiveChat = lazy(async () => {
  try {
    return await import("@/components/studio/BuddyLiveChat");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Studio] Buddy module failed to load:", error);
    throw new Error("Buddy could not load: " + message);
  }
});

class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.error("[Studio] Android UI error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="rounded-3xl border border-red-500/30 bg-red-950/30 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-300">Buddy startup error</p>
        <h2 className="mt-2 text-xl font-bold">The Studio shell is working.</h2>
        <p className="mt-2 break-words text-sm leading-6 text-white/70">{this.state.error}</p>
        <button
          type="button"
          className="mt-4 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white"
          onClick={() => window.location.reload()}
        >
          Retry Buddy
        </button>
      </section>
    );
  }
}

function AndroidStudioHome() {
  const [bootMessage, setBootMessage] = useState("Starting Little Red's Big Studio…");
  const [showBuddy, setShowBuddy] = useState(false);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error("[Studio] window error:", event.error || event.message);
      setBootMessage("Studio shell loaded. A feature reported an error; Buddy is isolated so the whole app cannot go black.");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error("[Studio] unhandled rejection:", event.reason);
      setBootMessage("Studio shell loaded. A background feature reported an error.");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const timer = window.setTimeout(() => {
      setBootMessage("Studio ready.");
      setShowBuddy(true);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090507] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090507]/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <StudioLogo compact className="[&>img]:w-32" />
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">Android</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-24 pt-4 sm:px-5 sm:pt-6">
        <section className="rounded-3xl border border-primary/25 bg-black/50 p-5 shadow-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Little Red's Big Studio</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight sm:text-5xl">Your creative studio.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Buddy is here first. Talk, type, use your microphone, create and build from one place.</p>
          <p className="mt-3 text-xs text-primary/80" role="status">{bootMessage}</p>
        </section>

        {showBuddy ? (
          <BootErrorBoundary>
            <Suspense fallback={<section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">Loading Buddy…</section>}>
              <BuddyLiveChat />
            </Suspense>
          </BootErrorBoundary>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">Starting Buddy…</section>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          {[["Create","Music, images, video and creative projects."],["Voice","Your Red voice path and local Android audio."],["Free-first","Use local and open routes before paid services."]].map(([title, copy]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-display text-sm font-bold text-white">{title}</p>
              <p className="mt-2 text-xs leading-5 text-white/45">{copy}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML = "<main style='padding:24px;color:white;background:#090507;min-height:100vh;font-family:sans-serif'><h1>Little Red's Big Studio</h1><p>The Android root element was missing.</p></main>";
} else {
  createRoot(root).render(<AndroidStudioHome />);
}
