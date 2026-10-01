import { BUDDY_VOICES, findSpeechVoice } from "./buddy-voices";
import { getLocalBuddyClone, isUsableLocalClone } from "./buddy-local-clone";

export type BuddyEngineId = "browser" | "kokoro" | "qwen3-tts" | "chatterbox-onnx" | "local-model";

export type BuddyEngine = {
  id: BuddyEngineId;
  name: string;
  local: true;
  cloning: boolean;
  multilingual: boolean;
  minimumMemoryGb?: number;
};

export const BUDDY_ENGINES: BuddyEngine[] = [
  { id: "browser", name: "Phone voice", local: true, cloning: false, multilingual: true },
  {
    id: "kokoro",
    name: "Kokoro 82M",
    local: true,
    cloning: false,
    multilingual: true,
    minimumMemoryGb: 2,
  },
  {
    id: "chatterbox-onnx",
    name: "Chatterbox Multilingual ONNX",
    local: true,
    cloning: true,
    multilingual: true,
    minimumMemoryGb: 4,
  },
  {
    id: "qwen3-tts",
    name: "Qwen3-TTS 0.6B",
    local: true,
    cloning: true,
    multilingual: true,
    minimumMemoryGb: 6,
  },
  {
    id: "local-model",
    name: "Installed Buddy model",
    local: true,
    cloning: true,
    multilingual: true,
  },
];

export function detectBuddyHardware() {
  if (typeof navigator === "undefined")
    return { webGpu: false, wasm: false, memoryGb: undefined as number | undefined };
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return {
    webGpu: Boolean(nav.gpu),
    wasm: typeof WebAssembly !== "undefined",
    memoryGb: nav.deviceMemory,
  };
}

export function chooseBuddyEngine(preferClone = false): BuddyEngine {
  const hardware = detectBuddyHardware();
  const installed = getLocalBuddyClone();
  if (isUsableLocalClone(installed)) return BUDDY_ENGINES.find((e) => e.id === "local-model")!;
  if (preferClone && (hardware.memoryGb ?? 8) >= 6 && hardware.webGpu)
    return BUDDY_ENGINES.find((e) => e.id === "qwen3-tts")!;
  if (preferClone && (hardware.memoryGb ?? 8) >= 4)
    return BUDDY_ENGINES.find((e) => e.id === "chatterbox-onnx")!;
  if (hardware.webGpu || hardware.wasm) return BUDDY_ENGINES.find((e) => e.id === "kokoro")!;
  return BUDDY_ENGINES.find((e) => e.id === "browser")!;
}

export async function speakBuddyLocally(
  text: string,
  voiceId = "browser-en-us",
  preferClone = false,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const nativeAndroid = (window as typeof window & {
    AndroidBuddyVoice?: {
      isAvailable?: () => boolean;
      speak?: (text: string) => boolean;
      speakAsync?: (text: string, callbackId: string) => void;
    };
  }).AndroidBuddyVoice;

  if (nativeAndroid?.speakAsync) {
    const callbackId = "tts-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    try {
      const started = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          delete (window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks?.[callbackId];
          window.clearTimeout(timer);
          resolve(ok);
        };
        const timer = window.setTimeout(() => finish(false), 9000);
        const callbacks = ((window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks ??= {});
        callbacks[callbackId] = finish;
        (window as typeof window & { __buddyAndroidTtsResult?: (id: string, ok: boolean) => void }).__buddyAndroidTtsResult ??= (id, ok) => {
          const callback = (window as typeof window & { __buddyAndroidTtsCallbacks?: Record<string, (ok: boolean) => void> }).__buddyAndroidTtsCallbacks?.[id];
          callback?.(ok);
        };
        nativeAndroid.speakAsync?.(text.trim(), callbackId);
      });
      // On Android, native TTS is the authoritative playback path. Do not
      // silently switch back to WebView/browser speech when native playback
      // fails; that was masking the real engine failure and producing false
      // "speaking" states.
      return started;
    } catch {
      return false;
    }
  } else if (nativeAndroid?.speak && nativeAndroid?.isAvailable?.()) {
    try { return nativeAndroid.speak(text.trim()) === true; } catch { return false; }
  }
  if (!("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const selected = BUDDY_VOICES.find((voice) => voice.id === voiceId) ?? BUDDY_VOICES[0];
  if (selected.kind === "cloned" || !text.trim()) return false;

  // Android Chrome/WebView can have an empty voice list until synthesis is
  // resumed. Give it a brief chance to populate before choosing the voice.
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        synth.removeEventListener("voiceschanged", finish);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(finish, 900);
      synth.addEventListener("voiceschanged", finish, { once: true });
      voices = synth.getVoices();
      if (voices.length) finish();
    });
    voices = synth.getVoices();
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let started = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selected.locale || "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
    const voice = findSpeechVoice(selected.locale) ??
      voices.find((candidate) => candidate.lang.toLowerCase().startsWith(selected.locale.toLowerCase().split("-")[0]));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { started = true; finish(true); };
    utterance.onerror = () => finish(false);
    utterance.onend = () => { if (!started) finish(false); };
    const timer = window.setTimeout(() => {
      if (!started) {
        try { synth.cancel(); } catch {}
        finish(false);
      }
    }, 8000);
    try {
      synth.cancel();
      synth.resume();
      synth.speak(utterance);
      // Some Android implementations delay starting until the next task.
      window.setTimeout(() => { if (!started && synth.paused) synth.resume(); }, 250);
    } catch {
      finish(false);
    }
    void preferClone;
  });
}
