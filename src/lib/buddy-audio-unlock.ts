let unlocked = false;
let context: AudioContext | null = null;
let fallbackAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

function getFallbackAudio(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  if (fallbackAudio) return fallbackAudio;
  const audio = document.createElement("audio");
  audio.muted = true;
  audio.setAttribute("playsinline", "true");
  audio.preload = "auto";
  fallbackAudio = audio;
  return audio;
}

export async function unlockBuddyAudio(): Promise<void> {
  if (typeof window === "undefined") return;

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
      // Fall through to the persistent HTMLAudio unlock attempt.
    }
  }

  const audio = getFallbackAudio();
  if (!audio) return;
  try {
    audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    unlocked = true;
  } catch {
    // A later user gesture can retry the unlock.
  }
}

export async function playBuddyAudio(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) throw new Error("Buddy audio is unavailable.");

  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (!unlocked || ctx.state !== "running") await unlockBuddyAudio();
      await ctx.resume();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Buddy audio request failed (${response.status}).`);
      const data = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data.slice(0));
      await new Promise<void>((resolve, reject) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => resolve();
        try {
          source.start(0);
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Buddy audio playback failed."));
        }
      });
      return;
    } catch (error) {
      if (error instanceof Error && error.message === "Buddy audio playback failed.") throw error;
      // Fall through to the media-element path for browsers that cannot decode the buffer.
    }
  }

  const audio = getFallbackAudio();
  if (!audio) throw new Error("This browser cannot play Buddy audio.");
  audio.muted = false;
  audio.src = url;
  audio.currentTime = 0;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
    };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error("Audio playback failed.")); };
    void audio.play().catch((error) => { cleanup(); reject(error instanceof Error ? error : new Error("Audio playback failed.")); });
  });
}

if (typeof window !== "undefined") {
  const retry = () => void unlockBuddyAudio();
  window.addEventListener("pointerdown", retry, { passive: true });
  window.addEventListener("touchstart", retry, { passive: true });
  window.addEventListener("keydown", retry, { passive: true });
}
