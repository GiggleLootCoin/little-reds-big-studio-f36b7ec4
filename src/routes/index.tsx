import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass, Film, Mic2, SlidersHorizontal, Users } from "lucide-react";
import { AnimatedBackground } from "@/components/studio/AnimatedBackground";
import { BuddyWelcome } from "@/components/studio/BuddyWelcome";
import { BuddyLiveChat } from "@/components/studio/BuddyLiveChat";
import { VoiceProfilePanel } from "@/components/studio/VoiceProfilePanel";
import { EntitlementBanner } from "@/components/studio/EntitlementBanner";
import { Chip, openStudioPanel } from "@/components/studio/ui";
import { NextMoves } from "@/components/studio/Dashboard";
import { FreeEngineDeck } from "@/components/studio/FreeEngineDeck";
import { FreeCreatePanel } from "@/components/studio/FreeCreatePanel";
import { StudioLogo } from "@/components/studio/StudioLogo";
import { cn } from "@/lib/utils";
import type { BuddyTask } from "@/lib/buddy-orchestrator";
import {
  LabPanel,
  QRangePanel,
  StoryboardPanel,
  UploadPanel,
  VideoPanel,
} from "@/components/studio/sections-create";
import {
  AccessPanel,
  ProfilePanel,
  SeoPanel,
  SpotlightPanel,
  SupportPanel,
} from "@/components/studio/sections-community";

const SITE_URL = "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev";
const TITLE = "Little Red's Big Studio — Free AI Music & Creator Studio";
const DESCRIPTION =
  "Little Red's Big Studio: Android-first creative tools with Buddy, free/open AI routes, music, voice, artwork, video and project workflows.";
const OG_IMAGE = `${SITE_URL}/logo.svg`;
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: Studio,
});

const VERSION = "Studio Version 5.2 — Free/Open Edition";
type TabId = "home" | "write" | "mix" | "video" | "community";
const TABS: { id: TabId; label: string; icon: typeof Compass }[] = [
  { id: "home", label: "Home", icon: Compass },
  { id: "write", label: "Create", icon: Mic2 },
  { id: "mix", label: "Mix", icon: SlidersHorizontal },
  { id: "video", label: "Video", icon: Film },
  { id: "community", label: "Artists", icon: Users },
];
const PANEL_TAB: Record<string, TabId> = {
  "audio-voice-file-uploads": "mix",
  "elite-lyrics-voice-cloning": "write",
  "honest-critiquer-ai-song-coach": "write",
  "automated-storyboarding": "video",
};
const BUDDY_TAB: Record<BuddyTask, TabId> = {
  writing: "write",
  voice: "mix",
  music: "write",
  stems: "mix",
  artwork: "video",
  video: "video",
};

function Studio() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("home");
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);
  const jump = (id: string) => {
    setTab(PANEL_TAB[id] ?? "write");
    setTimeout(() => openStudioPanel(id), 60);
  };
  const chooseBuddyTask = (task: BuddyTask) => {
    setTab(BUDDY_TAB[task]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const go = (next: TabId) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-[100svh] overflow-x-clip">
      <AnimatedBackground />
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/95 px-6 text-center backdrop-blur-xl">
          <StudioLogo />
          <div className="h-1 w-44 max-w-full overflow-hidden rounded-full bg-secondary">
            <div className="gloss-sheen crimson-gloss h-full w-full" />
          </div>
          <p className="font-display text-[0.62rem] font-semibold tracking-[0.24em] text-primary">
            {VERSION}
          </p>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 shadow-[0_12px_40px_oklch(0_0_0_/_0.2)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-5 sm:py-3">
          <button
            type="button"
            aria-label="Go to Studio home"
            onClick={() => go("home")}
            className="min-w-0 rounded-2xl p-1.5 text-left transition-transform active:scale-[0.98]"
          >
            <StudioLogo compact={false} className="[&>svg]:size-10 sm:[&>svg]:size-12" />
          </button>
          <div className="hidden items-center gap-2 sm:flex">
            <Chip>Free/open first</Chip>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              Buddy online
            </span>
          </div>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary sm:hidden">
            Buddy online
          </span>
        </div>
        <nav
          aria-label="Studio sections"
          className="mx-auto hidden w-full max-w-6xl gap-1 px-3 pb-2 sm:flex sm:px-5"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-display text-xs font-semibold tracking-wide transition-all",
                  tab === t.id
                    ? "crimson-gloss text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-3 pb-28 pt-3 sm:px-5 sm:pb-16 sm:pt-6 lg:px-8">
        {tab === "home" && (
          <div className="space-y-4 sm:space-y-6">
            <BuddyLiveChat />
            <EntitlementBanner />
            <BuddyWelcome onChoose={chooseBuddyTask} />
            <VoiceProfilePanel />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:items-start">
              <FreeEngineDeck onOpenCreate={() => go("write")} />
              <section className="rounded-2xl border border-border/60 bg-background/45 p-4 backdrop-blur-md sm:p-5">
                <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                  Your project
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Start anywhere. Buddy keeps the workflow moving while the engine deck gives you
                  direct free fallbacks.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip>Android-first</Chip>
                  <Chip>Free/open</Chip>
                  <Chip>Buddy-led</Chip>
                </div>
              </section>
            </div>
            <section className="space-y-3">
              <div>
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
                  Your next move
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a goal. The machinery stays backstage.
                </p>
              </div>
              <NextMoves onJump={jump} />
            </section>
            <section className="glass-panel rounded-2xl p-4 text-xs text-muted-foreground sm:p-5">
              <p>
                <span className="font-semibold text-foreground">Buddy handles the machinery.</span>{" "}
                Heavy models use verified free/open routes when local execution isn't practical.
              </p>
            </section>
            <SupportPanel />
          </div>
        )}
        {tab === "write" && (
          <div className="space-y-3">
            <FreeCreatePanel />
          </div>
        )}
        {tab === "mix" && (
          <div className="space-y-3">
            <UploadPanel />
            <QRangePanel />
            <LabPanel />
          </div>
        )}
        {tab === "video" && (
          <div className="space-y-3">
            <StoryboardPanel />
            <VideoPanel />
            <SeoPanel />
          </div>
        )}
        {tab === "community" && (
          <div className="space-y-3">
            <SpotlightPanel />
            <ProfilePanel />
            <AccessPanel />
          </div>
        )}
        <footer className="mt-8 pb-3 text-center text-[11px] text-muted-foreground sm:mt-10">
          <span>{VERSION}</span>
          <span className="mx-2">•</span>
          <span>Little Red's Big Studio — free/open edition</span>
        </footer>
      </main>
      <nav
        aria-label="Studio sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_oklch(0_0_0_/_0.28)] backdrop-blur-2xl sm:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => go(t.id)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 transition-colors active:bg-primary/10",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-xl",
                    active && "bg-primary/12",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-[0.58rem] font-semibold tracking-wide">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
