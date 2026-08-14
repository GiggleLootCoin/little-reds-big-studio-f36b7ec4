import { Client } from "@gradio/client";

export type BuddyVoiceMode = "preset" | "clone";
export type BuddyVoiceProfile = {
  mode: BuddyVoiceMode;
  speaker: string;
  language: string;
  mood?: string;
  tone?: string;
  referenceDataUrl?: string;
  referenceName?: string;
  referenceTranscript?: string;
};

export const BUDDY_VOICE_KEY = "lrbgs-buddy-voice-v1";

export const BUDDY_VOICE_PRESETS = [
  { id: "Ryan", label: "Jules", note: "English • bright, rhythmic, easygoing" },
  { id: "Aiden", label: "Sunny", note: "English • clear, youthful, upbeat" },
  { id: "Vivian", label: "Nova", note: "Multilingual • bright, crisp, expressive" },
  { id: "Serena", label: "Sage", note: "Multilingual • warm, gentle, reassuring" },
  { id: "Uncle_Fu", label: "Marlow", note: "Multilingual • low, mellow, grounded" },
  { id: "Dylan", label: "Skye", note: "Multilingual • clear, youthful, lively" },
  { id: "Eric", label: "Rook", note: "Multilingual • lively, husky, characterful" },
  { id: "Ono_Anna", label: "Pippa", note: "Japanese • playful, light, animated" },
  { id: "Sohee", label: "Mina", note: "Korean • warm, emotional, intimate" },
] as const;

export const BUDDY_LANGUAGE_CATALOG = [
  "Auto", "English", "Spanish", "French", "German", "Italian", "Portuguese", "Dutch",
  "Danish", "Finnish", "Greek", "Swedish", "Norwegian", "Polish", "Russian", "Arabic",
  "Hebrew", "Hindi", "Chinese", "Cantonese", "Japanese", "Korean", "Malay", "Swahili",
  "Thai", "Turkish", "Vietnamese", "Tagalog", "Romanian", "Hungarian", "Persian (Farsi)",
  "Macedonian", "Czech", "Ukrainian", "Indonesian", "Bengali", "Tamil", "Telugu", "Urdu",
  "Filipino", "Croatian", "Slovak", "Bulgarian", "Serbian", "Catalan", "Norwegian Bokmål",
] as const;

export const BUDDY_MOODS = [
  { id: "natural", label: "Natural", note: "Easy, human, unforced" },
  { id: "warm", label: "Warm", note: "Cosy and personable" },
  { id: "calm", label: "Calm", note: "Steady and soothing" },
  { id: "playful", label: "Playful", note: "Light, cheeky and fun" },
  { id: "energetic", label: "Energetic", note: "Bright and lively" },
  { id: "reassuring", label: "Reassuring", note: "Patient and comforting" },
  { id: "excited", label: "Excited", note: "Genuinely enthusiastic" },
  { id: "cinematic", label: "Cinematic", note: "Expressive and dramatic" },
  { id: "serious", label: "Serious", note: "Focused and composed" },
] as const;

export const BUDDY_TONES = [
  { id: "conversational", label: "Conversational", note: "Like a real back-and-forth" },
  { id: "friendly", label: "Friendly", note: "Open and approachable" },
  { id: "confident", label: "Confident", note: "Clear and assured" },
  { id: "empathetic", label: "Empathetic", note: "Attentive and understanding" },
  { id: "witty", label: "Witty", note: "Dry humour when it fits" },
  { id: "direct", label: "Direct", note: "Straight to the useful bit" },
  { id: "gentle", label: "Gentle", note: "Soft and considerate" },
  { id: "professional", label: "Professional", note: "Polished and precise" },
] as const;

const DEFAULT_PROFILE: BuddyVoiceProfile = {
  mode: "preset",
  speaker: "Ryan",
  language: "English",
  mood: "natural",
  tone: "conversational",
};

const DB_NAME = "little-reds-big-studio";
const STORE = "voice-profile";
const SAMPLE_KEY = "buddy-voice-sample";

function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open voice storage."));
  });
}

async function normalizeReferenceAudio(blob: Blob): Promise<Blob> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined" || /^audio\/(wav|wave|x-wav)$/i.test(blob.type)) {
    return blob;
  }

  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(buffer.numberOfChannels, 2);
    const samples = new Float32Array(buffer.length);
    for (let c = 0; c < channels; c += 1) {
      const source = buffer.getChannelData(c);
      for (let i = 0; i < buffer.length; i += 1) samples[i] += source[i] / channels;
    }

    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < pcm.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    const wav = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wav);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(wav, 44).set(new Uint8Array(pcm.buffer));
    return new Blob([wav], { type: "audio/wav" });
  } catch {
    return blob;
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function saveBuddyVoiceSample(blob: Blob) {
  const normalized = await normalizeReferenceAudio(blob);
  const db = await openVoiceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(normalized, SAMPLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save voice sample."));
  });
  db.close();
}

export async function getBuddyVoiceSample(): Promise<Blob | null> {
  try {
    const db = await openVoiceDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(SAMPLE_KEY);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return blob ? normalizeReferenceAudio(blob) : null;
  } catch {
    return null;
  }
}

export async function clearBuddyVoiceSample() {
  try {
    const db = await openVoiceDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(SAMPLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Local cleanup is best effort.
  }
}

export function getBuddyVoiceProfile(): BuddyVoiceProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(localStorage.getItem(BUDDY_VOICE_KEY) || "null") as Partial<BuddyVoiceProfile> | null;
    const selected = parsed ?? {};
    return {
      ...DEFAULT_PROFILE,
      ...selected,
      mode: selected.mode === "clone" ? "clone" : "preset",
      speaker: selected.speaker || DEFAULT_PROFILE.speaker,
      language: selected.language || DEFAULT_PROFILE.language,
      mood: selected.mood || DEFAULT_PROFILE.mood,
      tone: selected.tone || DEFAULT_PROFILE.tone,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveBuddyVoiceProfile(profile: BuddyVoiceProfile) {
  localStorage.setItem(BUDDY_VOICE_KEY, JSON.stringify(profile));
}

export async function clearBuddyVoiceClone() {
  const profile = getBuddyVoiceProfile();
  await clearBuddyVoiceSample();
  saveBuddyVoiceProfile({
    ...DEFAULT_PROFILE,
    speaker: profile.speaker || "Ryan",
    language: profile.language || "English",
    mood: profile.mood || "natural",
    tone: profile.tone || "conversational",
  });
}

export async function fileToVoiceDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read the voice sample."));
    reader.readAsDataURL(file);
  });
}
