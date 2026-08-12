import { ArrowRight, Sparkles } from "lucide-react";
import { buddyPlan, type BuddyTask } from "@/lib/buddy-orchestrator";
import { setBuddyStatus } from "@/lib/buddy-presence";
import { BuddyPresence } from "@/components/studio/BuddyPresence";
import { cn } from "@/lib/utils";
import { StudioLogo } from "@/components/studio/StudioLogo";
import studioHero from "../../../lobby-hero.jpg";
import luxuryBanner from "../../../img_luxury_banner_1784415120642.jpg";
import buddyReference from "../../../file_0000000070e8824391d24367b5f22d59.png";

const TASKS: { task: BuddyTask; title: string; copy: string }[] = [
  { task: "music", title: "Make music", copy: "Turn an idea, lyric or reference into music." },
  { task: "voice", title: "Work on vocals", copy: "Transform, polish or develop a vocal." },
  { task: "stems", title: "Clean the track", copy: "Separate and prepare the parts of your song." },
  { task: "artwork", title: "Create artwork", copy: "Build a visual world around your music." },
  { task: "video", title: "Make a music video", copy: "Turn your track and visuals into a story." },
  { task: "writing", title: "Write with Buddy", copy: "Draft, refine and sharpen your words." },
];

export function BuddyWelcome({ onChoose }: { onChoose: (task: BuddyTask) => void }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[1.5rem] border border-primary/35 bg-black shadow-[0_30px_100px_oklch(0_0_0_/_0.48)] sm:rounded-[2rem]">
      <img src={studioHero} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-45" />
      <img src={luxuryBanner} alt="" aria-hidden="true" className="absolute -right-8 bottom-0 h-44 w-80 rotate-1 object-cover opacity-25 mix-blend-screen blur-[0.2px] sm:h-56 sm:w-[28rem]" />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,oklch(0.055_0.02_20_/_0.98)_5%,oklch(0.09_0.025_20_/_0.8)_52%,oklch(0.12_0.06_20_/_0.42)_100%)]" />
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative p-4 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-primary"><span className="flex size-10 items-center justify-center rounded-xl bg-black/45 ring-1 ring-primary/40 backdrop-blur-md"><Sparkles className="size-5" /></span><span className="text-[10px] font-bold uppercase tracking-[0.24em] sm:text-xs">Buddy is ready</span></div>
            <h1 className="mt-5 max-w-2xl font-display text-[clamp(2.25rem,9vw,4.5rem)] font-black leading-[0.94] tracking-tight text-white drop-shadow-2xl">Make something brilliant.<span className="block text-primary text-glow">Buddy handles the rest.</span></h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">Bring your idea, track, voice or image. Buddy chooses the best available route for the job, keeps the technical machinery backstage, and leaves every creative decision in your hands.</p>
            <BuddyPresence className="mt-5 max-w-xl border-white/10 bg-black/35" />
          </div>

          <div className="buddy-stage relative mx-auto w-40 shrink-0 sm:w-48 lg:mx-0 lg:w-56" aria-label="Animated Buddy character">
            <div className="buddy-aura absolute inset-4 rounded-full bg-primary/25 blur-2xl" />
            <div className="buddy-ring absolute inset-2 rounded-[2.5rem] border border-primary/30 bg-black/20 backdrop-blur-sm" />
            <div className="buddy-character relative mx-auto aspect-square w-[86%] overflow-hidden rounded-[2.2rem] border border-white/15 bg-black/30 shadow-[0_20px_55px_oklch(0_0_0_/_0.5)]">
              <img src={buddyReference} alt="Buddy" className="buddy-character-image h-full w-full object-contain" />
              <div className="buddy-shine absolute inset-0 bg-[linear-gradient(115deg,transparent_20%,oklch(1_0_0_/_0.14)_48%,transparent_62%)]" />
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/85 px-3 py-2 shadow-xl backdrop-blur-md"><StudioLogo compact /></div>
            <span className="absolute -right-1 top-3 rounded-full border border-primary/40 bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-md">Buddy</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map(({ task, title, copy }) => {
            const plan = buddyPlan(task);
            return <button key={task} type="button" onClick={() => { setBuddyStatus(plan.mode === "unavailable" ? "error" : "thinking", { task, message: plan.mode === "unavailable" ? "That route isn't configured yet. I won't pretend otherwise." : null }); onChoose(task); }} className={cn("group min-h-24 rounded-2xl border border-white/10 bg-black/40 p-3.5 text-left shadow-lg backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:bg-primary/10 hover:shadow-[0_12px_35px_oklch(0.55_0.22_25_/_0.16)] active:scale-[0.985]", plan.mode === "unavailable" && "opacity-60")}><span className="flex items-center justify-between gap-2"><span className="font-display text-sm font-bold text-white">{title}</span><ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-1" /></span><span className="mt-1.5 block text-xs leading-5 text-white/55">{copy}</span></button>;
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold"><span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-primary backdrop-blur-md">Buddy chooses automatically</span><span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-white/65 backdrop-blur-md">Free-first</span><span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-white/65 backdrop-blur-md">Android ready</span><span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-white/65 backdrop-blur-md">No model setup</span></div>
      </div>
    </section>
  );
}
