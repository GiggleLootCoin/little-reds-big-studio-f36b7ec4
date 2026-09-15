let unlocked = false;
let context: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

export async function unlockBuddyAudio(): Promise<void> {
  if (typeof window === "undefined" || unlocked) return;

  const ctx = getAudioContext();
  if (ctx) {
    try {
      await ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.01);
      unlocked = true;
      return;
    } catch {
      // Fall through to the HTMLAudio unlock attempt.
    }
  }

  try {
    const audio = document.createElement("audio");
    audio.muted = true;
    audio.setAttribute("playsinline", "true");
    audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    await audio.play();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    unlocked = true;
  } catch {
    // A later user gesture can retry the unlock.
  }
}

if (typeof window !== "undefined") {
  const retry = () => void unlockBuddyAudio();
  window.addEventListener("pointerdown", retry, { passive: true });
  window.addEventListener("touchstart", retry, { passive: true });
  window.addEventListener("keydown", retry, { passive: true });
}
