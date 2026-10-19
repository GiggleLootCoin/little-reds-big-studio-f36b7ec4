import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BuddyLiveChat } from "@/components/studio/BuddyLiveChat";
import { StudioLogo } from "@/components/studio/StudioLogo";
import "@/styles.css";

function AndroidStudioHome() {
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
        </section>
        <BuddyLiveChat />
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
if (!root) throw new Error("Android Studio root element is missing.");
createRoot(root).render(<StrictMode><AndroidStudioHome /></StrictMode>);
