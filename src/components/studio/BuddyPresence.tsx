import { AlertCircle, Brain, CheckCircle2, Ear, Loader2, Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";
import { buddyLine } from "@/lib/buddy-personality";
import { getBuddyStatus, subscribeBuddyStatus } from "@/lib/buddy-presence";
import type { BuddyStatus } from "@/lib/buddy-presence";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";
import buddyReferenceVideo from "../../../Untitled 2026-08-06 03.58.21.mp4";
import { cn } from "@/lib/utils";
import { StudioLogo } from "@/components/studio/StudioLogo";
import "./BuddyVisual.css";

const STATUS_LABELS: Record<BuddyStatus, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  working: "Working",
  success: "Sorted",
  error: "Needs another go",
};

const STATUS_ICONS = {
  idle: Sparkles,
  listening: Ear,
  thinking: Brain,
  working: Loader2,
  success: CheckCircle2,
  error: AlertCircle,
} satisfies Record<BuddyStatus, typeof Sparkles>;

export function BuddyPresence({ className }: { className?: string }) {
  const snapshot = useSyncExternalStore(subscribeBuddyStatus, getBuddyStatus, getBuddyStatus);
  const Icon = STATUS_ICONS[snapshot.status];
  const line = snapshot.message ?? buddyLine(snapshot.status);

  return (
    <aside
      className={cn(
        "buddy-presence glass-panel relative overflow-hidden rounded-2xl p-3",
        className,
      )}
      data-buddy-status={snapshot.status}
      aria-label={`Buddy: ${STATUS_LABELS[snapshot.status]}`}
    >
      <div className="flex items-center gap-3">
        <div className="buddy-presence-character buddy-video-frame relative size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/35">
          <div className="buddy-aura absolute inset-0 rounded-full bg-primary/25 blur-lg" />
          <video
            className="buddy-character-video relative h-full w-full object-cover"
            src={buddyReferenceVideo}
            poster={buddyReference}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Animated Buddy"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon
              className={cn(
                "size-3.5 text-primary",
                snapshot.status === "working" && "animate-spin",
              )}
              aria-hidden
            />
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-primary">
              {STATUS_LABELS[snapshot.status]}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{line}</p>
        </div>
        <StudioLogo compact className="hidden sm:inline-flex" />
      </div>
    </aside>
  );
}
