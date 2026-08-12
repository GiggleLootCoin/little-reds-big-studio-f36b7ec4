import { AudioWaveform, Film, Image, Mic2, MessageCircle, Music2, Sparkles } from "lucide-react";
import { FREE_RUNNERS } from "@/lib/free-runners";

const featured = [
  {
    id: "hf-ace-step-15",
    icon: Music2,
    label: "Make a song",
    note: "Buddy routes this through verified free music generation.",
  },
  {
    id: "hf-applio",
    icon: Mic2,
    label: "Voice conversion",
    note: "Use your own voice/sample for supported conversion workflows.",
  },
  {
    id: "hf-z-image",
    icon: Image,
    label: "Make artwork",
    note: "Fast open artwork route with automatic fallback.",
  },
  {
    id: "hf-wan-22-fast",
    icon: Film,
    label: "Make video",
    note: "Open video generation with automatic provider failover.",
  },
  {
    id: "hf-demucs",
    icon: AudioWaveform,
    label: "Split stems",
    note: "Separate vocals and instruments from your own audio.",
  },
  {
    id: "hf-qwen3-webgpu",
    icon: MessageCircle,
    label: "Buddy writing",
    note: "Browser-local writing fallback on capable Android devices.",
  },
];

export function FreeEngineDeck({ onOpenCreate }: { onOpenCreate: () => void }) {
  return (
    <section className="rounded-2xl border border-primary/30 bg-background/55 p-4 shadow-[0_0_35px_hsl(var(--primary)/0.08)] backdrop-blur-md sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-primary">
            Free engine deck
          </p>
        </div>
        <h2 className="mt-1 font-display text-lg font-bold">
          Real tools. Buddy handles the machinery.
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Pick what you want to make. Buddy chooses a live compatible route, validates the result
          and falls back automatically when a public free service is unavailable.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {featured.map(({ id, icon: Icon, label, note }) => {
          const runner = FREE_RUNNERS.find((r) => r.id === id);
          if (!runner) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={onOpenCreate}
              className="group rounded-xl border border-border/70 bg-background/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5"
              title={runner.name}
            >
              <Icon className="size-4 text-primary" />
              <p className="mt-3 font-display text-xs font-semibold">{label}</p>
              <p className="mt-1 text-[0.65rem] leading-snug text-muted-foreground">{note}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
