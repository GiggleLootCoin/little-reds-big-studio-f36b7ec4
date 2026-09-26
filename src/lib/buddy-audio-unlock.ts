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

async function unlockMediaElement(audio: HTMLAudioElement): Promise<boolean> {
  try {
    audio.muted = true;
    audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch {
    return false;
  }
}

export async function unlockBuddyAudio(): Promise<void> {
  if (typeof window === "undefined") return;

  let contextUnlocked = false;
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
      contextUnlocked = true;
    } catch {
      // Continue with the media-element unlock below.
    }
  }

  const audio = getFallbackAudio();
  const mediaUnlocked = audio ? await unlockMediaElement(audio) : false;
  unlocked = contextUnlocked || mediaUnlocked;
}

async function playWithMediaElement(url: string): Promise<void> {
  const audio = getFallbackAudio();
  if (!audio) throw new Error("This browser cannot play Buddy audio.");
  audio.muted = false;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.src = url;
  audio.currentTime = 0;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    audio.onplaying = () => {
      if (settled) return;
      settled = true;
      cleanup();
      void audio.play().catch(() => undefined);
      resolve();
    };
    audio.onended = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    audio.onerror = () => fail(new Error("Audio playback failed."));
    const timer = window.setTimeout(() => fail(new Error("Buddy audio playback timed out.")), 15000);
    const originalCleanup = cleanup;
    const cleanupWithTimer = () => {
      window.clearTimeout(timer);
      originalCleanup();
    };
    audio.onplaying = () => {
      if (settled) return;
      settled = true;
      cleanupWithTimer();
      resolve();
    };
    audio.onended = () => {
      if (settled) return;
      settled = true;
      cleanupWithTimer();
      resolve();
    };
    void audio.play().catch((error) => fail(error instanceof Error ? error : new Error("Audio playback failed.")));
  });
  await new Promise<void>((resolve) => {
    if (audio.paused || audio.ended) return resolve();
    const finish = () => { audio.removeEventListener("ended", finish); resolve(); };
    audio.addEventListener("ended", finish, { once: true });
  });
}

export async function playBuddyAudio(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) throw new Error("Buddy audio is unavailable.");

  const audio = getFallbackAudio();
  if (audio) {
    try {
      await playWithMediaElement(url);
      return;
    } catch {
      // Fall through to Web Audio for browsers that authorize the context but not the media element.
    }
  }

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
    } catch {
      // Fall through to the media-element path.
    }
  }

  try {
    await playWithMediaElement(url);
    return;
  } catch {
    // Final retry after re-unlocking the media element.
    await unlockBuddyAudio();
    await playWithMediaElement(url);
  }
}

if (typeof window !== "undefined") {
  const retry = () => void unlockBuddyAudio();
  window.addEventListener("pointerdown", retry, { passive: true });
  window.addEventListener("touchstart", retry, { passive: true });
  window.addEventListener("keydown", retry, { passive: true });
}
