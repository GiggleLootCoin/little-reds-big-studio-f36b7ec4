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
  cloneVerified?: boolean;
  cloneVerifiedAt?: string;
  cloneProvider?: string;
};
export type BuddyVoicePreset = {
  id: string;
  label: string;
  note: string;
  nativeLanguage: string;
  languages: string[];
  character: string;
};
export const BUDDY_VOICE_KEY = "lrbgs-buddy-voice-v2";
export const BUDDY_VOICE_PRESETS: readonly BuddyVoicePreset[] = [
  {
    id: "Ryan",
    label: "Rook",
    note: "Low-mid, rhythmic, effortlessly assured",
    nativeLanguage: "English",
    languages: [
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Chinese",
      "Japanese",
      "Korean",
    ],
    character: "Dry wit, street-smart warmth, never in a rush.",
  },
  {
    id: "Aiden",
    label: "Sunny Vale",
    note: "Clear, bright, open and naturally upbeat",
    nativeLanguage: "English",
    languages: [
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Chinese",
      "Japanese",
      "Korean",
    ],
    character: "The mate who makes a complicated thing suddenly feel doable.",
  },
  {
    id: "Vivian",
    label: "Velvet Circuit",
    note: "Bright edge with a polished, animated lift",
    nativeLanguage: "Chinese",
    languages: [
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
      "Korean",
    ],
    character: "Quick-minded, expressive and slightly mischievous.",
  },
  {
    id: "Serena",
    label: "Honey Static",
    note: "Gentle warmth with a close, intimate presence",
    nativeLanguage: "Chinese",
    languages: [
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
      "Korean",
    ],
    character: "Soft around the edges, observant, reassuring without going syrupy.",
  },
  {
    id: "Uncle_Fu",
    label: "Night Train",
    note: "Deep, mellow and grounded with quiet authority",
    nativeLanguage: "Chinese",
    languages: [
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
      "Korean",
    ],
    character: "Steady storyteller energy. Calm enough to make chaos sit down.",
  },
  {
    id: "Dylan",
    label: "Sidewinder",
    note: "Youthful, clear and naturally punchy",
    nativeLanguage: "Chinese (Beijing)",
    languages: [
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
      "Korean",
    ],
    character: "Fast on the comeback, playful without becoming cartoonish.",
  },
  {
    id: "Eric",
    label: "Afterglow",
    note: "Husky brightness with lively forward motion",
    nativeLanguage: "Chinese (Sichuan)",
    languages: [
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
      "Korean",
    ],
    character: "Big personality, bright eyes, a little cinematic when the moment earns it.",
  },
  {
    id: "Ono_Anna",
    label: "Moonwire",
    note: "Light, nimble and playful with delicate phrasing",
    nativeLanguage: "Japanese",
    languages: [
      "Japanese",
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Korean",
    ],
    character: "Curious, clever and quietly sparkling.",
  },
  {
    id: "Sohee",
    label: "Emberline",
    note: "Warm emotional colour with a rich, human centre",
    nativeLanguage: "Korean",
    languages: [
      "Korean",
      "Chinese",
      "English",
      "German",
      "French",
      "Spanish",
      "Italian",
      "Portuguese",
      "Russian",
      "Japanese",
    ],
    character: "Tender when needed, grounded when it matters, never overly theatrical.",
  },
] as const;
export const BUDDY_SUPPORTED_LANGUAGES = [
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "German",
  "French",
  "Russian",
  "Portuguese",
  "Spanish",
  "Italian",
] as const;
export const BUDDY_MOODS = [
  { id: "natural", label: "Natural", note: "Human, relaxed, unforced" },
  { id: "warm", label: "Warm", note: "Closer, softer, more personable" },
  { id: "calm", label: "Calm", note: "Steady, slow, soothing" },
  { id: "playful", label: "Playful", note: "Bouncy, cheeky, mischievous" },
  { id: "energetic", label: "Energetic", note: "Brighter pace and punch" },
  { id: "reassuring", label: "Reassuring", note: "Patient, gentle, grounded" },
  { id: "excited", label: "Excited", note: "Big energy without shouting" },
  { id: "cinematic", label: "Cinematic", note: "Expressive, dramatic, vivid" },
  { id: "serious", label: "Serious", note: "Focused, restrained, deliberate" },
] as const;
export const BUDDY_TONES = [
  { id: "conversational", label: "Conversational", note: "Natural back-and-forth" },
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
const CLONE_PREVIEW_KEY = "buddy-voice-clone-preview";
function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable."));
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
  if (
    typeof window === "undefined" ||
    typeof AudioContext === "undefined" ||
    /^audio\/(wav|wave|x-wav)$/i.test(blob.type)
  )
    return blob;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(buffer.numberOfChannels, 2),
      samples = new Float32Array(buffer.length);
    for (let channel = 0; channel < channels; channel++) {
      const source = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) samples[i] += source[i] / channels;
    }
    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < pcm.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const wav = new ArrayBuffer(44 + pcm.byteLength),
      view = new DataView(wav);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
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
async function putVoiceValue(key: string, value: unknown): Promise<void> {
  const db = await openVoiceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save voice state."));
  });
  db.close();
}
async function getVoiceValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openVoiceDb();
    const value = await new Promise<T | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}
export async function saveBuddyVoiceSample(blob: Blob): Promise<void> {
  await putVoiceValue(SAMPLE_KEY, await normalizeReferenceAudio(blob));
}
export async function getBuddyVoiceSample(): Promise<Blob | null> {
  const blob = await getVoiceValue<Blob>(SAMPLE_KEY);
  return blob ? normalizeReferenceAudio(blob) : null;
}
export async function saveBuddyClonePreview(blob: Blob, provider: string): Promise<void> {
  await putVoiceValue(CLONE_PREVIEW_KEY, { blob, provider, createdAt: new Date().toISOString() });
}
export async function getBuddyClonePreview(): Promise<{
  blob: Blob;
  provider: string;
  createdAt: string;
} | null> {
  return getVoiceValue(CLONE_PREVIEW_KEY);
}
export async function clearBuddyVoiceSample(): Promise<void> {
  try {
    const db = await openVoiceDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(SAMPLE_KEY);
      tx.objectStore(STORE).delete(CLONE_PREVIEW_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best effort */
  }
}
function legacyProfile(): Partial<BuddyVoiceProfile> | null {
  if (typeof window === "undefined") return null;
  for (const key of ["buddy-voice-choice", "buddyVoiceChoice"])
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw) as unknown;
      if (typeof value === "string") return { mode: "preset", speaker: value };
      if (value && typeof value === "object") {
        const item = value as Record<string, unknown>;
        return {
          mode: item.mode === "clone" ? "clone" : "preset",
          speaker: typeof item.speaker === "string" ? item.speaker : undefined,
          language: typeof item.language === "string" ? item.language : undefined,
          mood: typeof item.mood === "string" ? item.mood : undefined,
          tone: typeof item.tone === "string" ? item.tone : undefined,
          referenceTranscript:
            typeof item.referenceTranscript === "string" ? item.referenceTranscript : undefined,
        };
      }
    } catch {
      /* ignore */
    }
  return null;
}
export function getBuddyVoiceProfile(): BuddyVoiceProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(BUDDY_VOICE_KEY) || "null",
    ) as Partial<BuddyVoiceProfile> | null;
    const selected = parsed ?? legacyProfile();
    return {
      ...DEFAULT_PROFILE,
      ...selected,
      mode: selected?.mode === "clone" ? "clone" : "preset",
      speaker: selected?.speaker || DEFAULT_PROFILE.speaker,
      language: selected?.language || DEFAULT_PROFILE.language,
      mood: selected?.mood || DEFAULT_PROFILE.mood,
      tone: selected?.tone || DEFAULT_PROFILE.tone,
      cloneVerified: Boolean(selected?.cloneVerified),
      cloneVerifiedAt: selected?.cloneVerifiedAt,
      cloneProvider: selected?.cloneProvider,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}
export function saveBuddyVoiceProfile(profile: BuddyVoiceProfile) {
  localStorage.setItem(BUDDY_VOICE_KEY, JSON.stringify(profile));
}
export async function markBuddyCloneVerified(provider: string) {
  const profile = getBuddyVoiceProfile();
  saveBuddyVoiceProfile({
    ...profile,
    mode: "clone",
    cloneVerified: true,
    cloneVerifiedAt: new Date().toISOString(),
    cloneProvider: provider,
  });
}
export async function clearBuddyVoiceClone() {
  const profile = getBuddyVoiceProfile();
  await clearBuddyVoiceSample();
  saveBuddyVoiceProfile({
    mode: "preset",
    speaker: profile.speaker || "Ryan",
    language: profile.language || "English",
    mood: profile.mood || "natural",
    tone: profile.tone || "conversational",
    cloneVerified: false,
  });
}
export async function fileToVoiceDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read the voice sample."));
    reader.readAsDataURL(file);
  });
}
function buddyStyleInstruction(profile: BuddyVoiceProfile): string {
  const mood = profile.mood && profile.mood !== "natural" ? profile.mood : "natural",
    tone = profile.tone && profile.tone !== "conversational" ? profile.tone : "conversational";
  if (mood === "natural" && tone === "conversational") return "";
  return `Speak naturally with a ${mood} mood and a ${tone} tone. Keep the delivery human, nuanced, and conversational; do not sound exaggerated or robotic.`;
}
const guardedClient = Client.prototype as unknown as {
  predict: (endpoint: string, data?: unknown, ...rest: unknown[]) => Promise<unknown>;
  __buddyStylePatched?: boolean;
};
if (!guardedClient.__buddyStylePatched) {
  const originalPredict = guardedClient.predict;
  guardedClient.predict = function (endpoint, data, ...rest) {
    if (
      endpoint === "/generate_custom_voice" &&
      Array.isArray(data) &&
      data.length >= 5 &&
      typeof window !== "undefined"
    ) {
      const args = [...data];
      args[3] = buddyStyleInstruction(getBuddyVoiceProfile());
      return originalPredict.call(this, endpoint, args, ...rest);
    }
    return originalPredict.call(this, endpoint, data, ...rest);
  };
  guardedClient.__buddyStylePatched = true;
}
