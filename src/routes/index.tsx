import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass, Film, Mic2, SlidersHorizontal, Users } from "lucide-react";
import logo from "@/assets/littlered-logo.png.asset.json";
import { AnimatedBackground } from "@/components/studio/AnimatedBackground";
import { BuddyWelcome } from "@/components/studio/BuddyWelcome";
import { BuddyLiveChat } from "@/components/studio/BuddyLiveChat";
import { EntitlementBanner } from "@/components/studio/EntitlementBanner";
import { Chip, openStudioPanel } from "@/components/studio/ui";
import { NextMoves } from "@/components/studio/Dashboard";
import { FreeEngineDeck } from "@/components/studio/FreeEngineDeck";
import { FreeCreatePanel } from "@/components/studio/FreeCreatePanel";
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
const OG_IMAGE = `${SITE_URL}${logo.url}`;
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
const VERSION = "Studio Version 5.1 — Free/Open Edition";
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
    <>
      <AnimatedBackground />
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/95 backdrop-blur-xl">
          <img
            src={logo.url}
            alt="Little Red's Big Studio"
            className="w-56 max-w-[72vw] animate-moon"
            onError={(e) => {
              e.currentTarget.src = "/favicon.ico";
            }}
          />
          <div className="h-1 w-44 overflow-hidden rounded-full bg-secondary">
            <div className="gloss-sheen crimson-gloss h-full w-full" />
          </div>
          <p className="font-display text-[0.65rem] font-semibold tracking-[0.28em] text-primary">
            {VERSION}
          </p>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/75 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-center px-4 py-3.5">
          <a
            href="./"
            aria-label="Little Red's Big Studio home"
            className="group flex items-center justify-center rounded-2xl px-3 py-1.5"
          >
            <img
              src={logo.url}
              alt="Little Red's Big Studio logo"
              className="h-12 w-auto max-w-[82vw] object-contain sm:h-14"
              onError={(e) => {
                e.currentTarget.src = "/favicon.ico";
              }}
            />
          </a>
        </div>
        <nav
          aria-label="Studio sections"
          className="mx-auto hidden w-full max-w-4xl gap-1 px-4 pb-2 sm:flex"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
              className={cn(
                "flex-1 rounded-xl px-3 py-2.5 font-display text-xs font-semibold tracking-wide",
                tab === t.id
                  ? "crimson-gloss text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 sm:pb-16 sm:pt-7">
        {tab === "home" && (
          <div className="space-y-5">
            <EntitlementBanner />
            <BuddyWelcome onChoose={chooseBuddyTask} />
            <BuddyLiveChat />
            <FreeEngineDeck onOpenCreate={() => go("write")} />
            <section className="rounded-2xl border border-border/60 bg-background/45 p-4 backdrop-blur-md sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                    Your project
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start anywhere. Buddy keeps the workflow moving while the engine deck gives you
                    direct free fallbacks.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip>Android-first</Chip>
                  <Chip>Free/open first</Chip>
                  <Chip>Buddy-led</Chip>
                </div>
              </div>
            </section>
            <section className="space-y-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
                Your next move
              </h2>
              <NextMoves onJump={jump} />
            </section>
            <section className="rounded-2xl border border-border/50 bg-background/35 p-4 text-xs text-muted-foreground backdrop-blur-md">
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
        <footer className="mt-10 text-center text-xs text-muted-foreground">
          <span>{VERSION}</span>
          <span className="mx-2">•</span>
          <span>Little Red's Big Studio — free/open edition</span>
        </footer>
      </main>
      <nav
        aria-label="Studio sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl sm:hidden"
      >
        <div className="grid grid-cols-5">
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
                  "flex min-h-14 flex-col items-center justify-center gap-1",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                <span className="text-[0.6rem] font-semibold tracking-wide">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
