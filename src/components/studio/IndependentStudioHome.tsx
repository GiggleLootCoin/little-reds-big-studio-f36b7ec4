import { useState } from "react";
import { AudioWaveform, Film, Home, Image as ImageIcon, MessageCircle, Mic2, Music2, Sparkles, Users, WandSparkles } from "lucide-react";
import { AnimatedBackground } from "./AnimatedBackground";
import { BuddyLiveChat } from "./BuddyLiveChat";
import { FreeEngineDeck } from "./FreeEngineDeck";
import { FreeCreatePanel } from "./FreeCreatePanel";
import { StudioLogo } from "./StudioLogo";
import { OfficialStationPanel } from "./OfficialStationPanel";
import { Chip } from "./ui";
import { NextMoves } from "./Dashboard";
import { EntitlementBanner } from "./EntitlementBanner";
import { cn } from "@/lib/utils";
import {
  LabPanel,
  QRangePanel,
  StoryboardPanel,
  UploadPanel,
  VideoPanel,
} from "./sections-create";
import {
  AccessPanel,
  ProfilePanel,
  SeoPanel,
  SpotlightPanel,
  SupportPanel,
} from "./sections-community";

type View = "home" | "create" | "audio" | "video" | "community";

const nav: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Studio", icon: Home },
  { id: "create", label: "Create", icon: WandSparkles },
  { id: "audio", label: "Audio", icon: AudioWaveform },
  { id: "video", label: "Video", icon: Film },
  { id: "community", label: "Artists", icon: Users },
];

const actions = [
  { view: "create" as const, icon: Music2, title: "Start a creation", copy: "Open the main creative workspace and let Buddy help shape the idea." },
  { view: "audio" as const, icon: Mic2, title: "Work on a voice", copy: "Bring in vocals, recordings or stems and build from there." },
  { view: "video" as const, icon: ImageIcon, title: "Build the visual", copy: "Turn music and imagery into a visual project." },
  { view: "community" as const, icon: Users, title: "Your artist space", copy: "Profile, station and community tools in one place." },
];

export function IndependentStudioHome() {
  const [view, setView] = useState<View>("home");

  const go = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="independent-studio relative min-h-[100svh] overflow-x-clip">
      <AnimatedBackground />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090507]/82 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-3 py-2 sm:px-6">
          <button type="button" onClick={() => go("home")} aria-label="Studio home" className="shrink-0">
            <StudioLogo compact className="[&>img]:w-28 sm:[&>img]:w-36" />
          </button>

          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-primary">
              Independent build
            </p>
            <p className="truncate text-xs text-white/45">A fresh architecture experiment for Little Red's Big Studio</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary md:inline-flex">
              Free-first
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-white/70">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Ready
            </span>
          </div>
        </div>

        <nav className="mx-auto hidden max-w-7xl gap-1 px-3 pb-2 sm:flex sm:px-6" aria-label="Studio sections">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-all",
                view === id
                  ? "crimson-gloss text-primary-foreground"
                  : "text-white/45 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-3 pb-28 pt-4 sm:px-6 sm:pb-16 sm:pt-7 lg:px-8">
        {view === "home" && (
          <div className="space-y-5 sm:space-y-7">
            <section className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-black/55 p-5 shadow-[0_30px_100px_oklch(0_0_0_/_0.42)] backdrop-blur-xl sm:p-8 lg:p-10">
              <div className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-primary/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-40 left-1/3 size-96 rounded-full bg-rose-500/10 blur-3xl" />

              <div className="relative grid gap-7 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                      Your creative command center
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-white/50">
                      Android-first
                    </span>
                  </div>
                  <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.2rem,8vw,5.2rem)] font-black leading-[0.9] tracking-tight text-white">
                    Little Red's
                    <span className="block text-primary text-glow">Big Studio.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60 sm:text-base sm:leading-7">
                    A cleaner experiment: Buddy is the front door, the creative tools stay one tap away,
                    and the technical machinery stays backstage.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <Chip>Buddy-led</Chip>
                    <Chip>Free/open routes</Chip>
                    <Chip>Red voice path</Chip>
                    <Chip>Local backup</Chip>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-inner sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
                      <MessageCircle className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold">Buddy first</p>
                      <p className="text-xs text-white/45">Talk, type, attach, create.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["01", "Understand"],
                      ["02", "Choose"],
                      ["03", "Create"],
                      ["04", "Recover"],
                    ].map(([number, label]) => (
                      <div key={number} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <span className="text-[9px] font-bold tracking-widest text-primary">{number}</span>
                        <p className="mt-1 text-xs font-semibold text-white/75">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <BuddyLiveChat />

            <EntitlementBanner />

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {actions.map(({ view: target, icon: Icon, title, copy }) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => go(target)}
                  className="group rounded-3xl border border-white/10 bg-black/35 p-4 text-left backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-primary/35 hover:bg-primary/[0.06] sm:p-5"
                >
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-5 font-display text-sm font-bold text-white">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-white/45">{copy}</p>
                  <span className="mt-4 inline-block text-[10px] font-bold uppercase tracking-widest text-primary transition-transform group-hover:translate-x-1">
                    Open →
                  </span>
                </button>
              ))}
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
              <FreeEngineDeck onOpenCreate={() => go("create")} />
              <section className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">Design rule</p>
                </div>
                <h2 className="mt-2 font-display text-lg font-bold">Never pretend a tool worked.</h2>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  This build favors explicit states and real fallbacks over silent substitutions.
                  If a provider fails, Buddy should say so and move to the next viable path.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/55">Local when practical</span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/55">Free before paid</span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/55">Visible failures</span>
                </div>
              </section>
            </div>

            <section className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">Quick start</p>
              <h2 className="mt-2 font-display text-xl font-bold">What are you making today?</h2>
              <p className="mt-1 text-xs text-white/45">Pick a workspace. Buddy remains available above.</p>
              <div className="mt-4">
                <NextMoves onJump={() => go("create")} />
              </div>
            </section>

            <SupportPanel />
          </div>
        )}

        {view === "create" && <div className="space-y-4"><FreeCreatePanel /></div>}
        {view === "audio" && <div className="space-y-4"><UploadPanel /><QRangePanel /><LabPanel /></div>}
        {view === "video" && <div className="space-y-4"><StoryboardPanel /><VideoPanel /><SeoPanel /></div>}
        {view === "community" && <div className="space-y-4"><SpotlightPanel /><ProfilePanel /><OfficialStationPanel /><AccessPanel /></div>}

        <footer className="mt-10 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
          Little Red's Big Studio • Independent comparison build
        </footer>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090507]/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl sm:hidden" aria-label="Mobile studio sections">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[9px] font-bold transition-colors",
                view === id ? "text-primary" : "text-white/40",
              )}
            >
              <span className={cn("flex size-8 items-center justify-center rounded-xl", view === id && "bg-primary/10")}>
                <Icon className="size-5" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
