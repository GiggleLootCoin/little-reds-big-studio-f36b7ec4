let unlocked = false;
let silentAudio: HTMLAudioElement | null = null;

// Valid 20 ms, 8 kHz, mono, 16-bit PCM silence. A real non-empty media
// payload is required for Android/TWA media-session priming.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export function installMobileAudioUnlock() {
  if (typeof window === "undefined" || unlocked) return;

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      const audio = new Audio(SILENT_WAV);
      audio.muted = true;
      audio.volume = 0;
      silentAudio = audio;
      void audio.play().catch(() => undefined);
      window.setTimeout(() => {
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch {}
        if (silentAudio === audio) silentAudio = null;
      }, 250);
    } catch {}
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
  window.addEventListener("keydown", unlock, true);
}
