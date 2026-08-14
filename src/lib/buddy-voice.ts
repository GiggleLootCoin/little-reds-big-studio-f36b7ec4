import { Client } from "@gradio/client";

export type BuddyVoiceMode = "preset" | "clone";
export type BuddyVoiceProfile = {
  mode: BuddyVoiceMode;
  speaker: string;
  language: string;
  mood?: string;
  tone?: string;
  instruct?: string;
  referenceDataUrl?: string;
  referenceName?: string;
  referenceTranscript?: string;
};

export const BUDDY_VOICE_KEY = "lrbgs-buddy-voice-v1";

export const BUDDY_VOICE_PRESETS = [
  { id: "Ryan", label: "Atlas", note: "Confident English • rhythmic, polished, presenter-ready", instruct: "Speak with confident clarity, natural pacing, and polished presenter energy." },
  { id: "Aiden", label: "Cameron", note: "Sunny American • clear, friendly, effortless", instruct: "Speak naturally with a sunny American warmth and an easy, friendly delivery." },
  { id: "Vivian", label: "Vivi", note: "Bright female • crisp, expressive, modern", instruct: "Speak brightly and expressively with crisp articulation and modern energy." },
  { id: "Serena", label: "Sienna", note: "Warm female • gentle, intimate, reassuring", instruct: "Speak warmly and gently, with intimate phrasing and reassuring presence." },
  { id: "Uncle_Fu", label: "Marlow", note: "Low male • mellow, grounded, seasoned", instruct: "Speak in a low, mellow, grounded voice with calm seasoned authority." },
  { id: "Dylan", label: "Kai", note: "Youthful male • clean, lively, conversational", instruct: "Speak with youthful clarity, lively rhythm, and relaxed conversational timing." },
  { id: "Eric", label: "Rook", note: "Character male • husky, bright, mischievous", instruct: "Speak with a lightly husky character, bright energy, and a mischievous edge." },
  { id: "Ono_anna", label: "Hana", note: "Japanese female • playful, nimble, animated", instruct: "Speak playfully with nimble timing, light expression, and animated warmth." },
  { id: "Sohee", label: "Mina", note: "Korean female • warm, emotional, intimate", instruct: "Speak warmly and emotionally with intimate, natural conversational phrasing." },
  { id: "Ryan", label: "Ace", note: "Radio host • punchy, assured, energetic", instruct: "Sound like a confident radio host: punchy, clear, energetic, never rushed." },
  { id: "Aiden", label: "Jett", note: "Creator voice • upbeat, relaxed, camera-friendly", instruct: "Speak like a relaxed content creator: upbeat, personable, spontaneous, and clear." },
  { id: "Vivian", label: "Luna", note: "Soft modern • bright, smooth, reassuring", instruct: "Speak softly and smoothly with bright modern warmth and reassuring expression." },
  { id: "Serena", label: "Willow", note: "Storyteller • tender, thoughtful, cinematic", instruct: "Speak like a thoughtful storyteller with tender emotion and subtle cinematic phrasing." },
  { id: "Uncle_Fu", label: "Bishop", note: "Deep calm • steady, rich, authoritative", instruct: "Speak with a rich, steady, authoritative presence while staying natural and warm." },
  { id: "Dylan", label: "Milo", note: "Friendly guy • casual, bright, approachable", instruct: "Speak casually and brightly, like a genuinely friendly person chatting one-to-one." },
  { id: "Eric", label: "Dex", note: "Edgy character • playful, husky, quick-witted", instruct: "Speak with playful confidence, a slightly husky edge, and quick-witted timing." },
  { id: "Ono_anna", label: "Aiko", note: "Japanese bright • delicate, lively, expressive", instruct: "Speak with delicate brightness, lively expression, and natural Japanese conversational rhythm." },
  { id: "Sohee", label: "Nari", note: "Korean warm • sincere, soft, expressive", instruct: "Speak sincerely and softly with expressive warmth and natural Korean conversational feeling." },
] as const;

export const BUDDY_LANGUAGE_CATALOG = [
  "Auto", "Chinese", "English", "Japanese", "Korean", "French", "German", "Spanish", "Portuguese", "Russian",
] as const;

export const BUDDY_MOODS = [
  { id: "natural", label: "Natural", note: "Human, easy, unforced" },
  { id: "warm", label: "Warm", note: "Personal and inviting" },
  { id: "calm", label: "Calm", note: "Steady and soothing" },
  { id: "playful", label: "Playful", note: "Light and cheeky" },
  { id: "energetic", label: "Energetic", note: "Bright and lively" },
  { id: "reassuring", label: "Reassuring", note: "Patient and comforting" },
  { id: "excited", label: "Excited", note: "Genuinely enthusiastic" },
  { id: "cinematic", label: "Cinematic", note: "Expressive and dramatic" },
  { id: "serious", label: "Serious", note: "Focused and composed" },
] as const;

export const BUDDY_TONES = [
  { id: "conversational", label: "Conversational", note: "Natural back-and-forth" },
  { id: "friendly", label: "Friendly", note: "Open and approachable" },
  { id: "confident", label: "Confident", note: "Clear and assured" },
  { id: "empathetic", label: "Empathetic", note: "Attentive and understanding" },
  { id: "witty", label: "Witty", note: "Dry humour when it fits" },
  { id: "direct", label: "Direct", note: "Straight to the point" },
  { id: "gentle", label: "Gentle", note: "Soft and considerate" },
  { id: "professional", label: "Professional", note: "Polished and precise" },
] as const;

const DEFAULT_PROFILE: BuddyVoiceProfile = { mode: "preset", speaker: "Ryan", language: "English", mood: "natural", tone: "conversational", instruct: BUDDY_VOICE_PRESETS[0].instruct };
const DB_NAME = "little-reds-big-studio";
const STORE = "voice-profile";
const SAMPLE_KEY = "buddy-voice-sample";

function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable."));
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open voice storage."));
  });
}

async function normalizeReferenceAudio(blob: Blob): Promise<Blob> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined" || /^audio\/(wav|wave|x-wav)$/i.test(blob.type)) return blob;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Math.min(buffer.numberOfChannels, 2);
    const samples = new Float32Array(buffer.length);
    for (let c = 0; c < channels; c += 1) { const source = buffer.getChannelData(c); for (let i = 0; i < buffer.length; i += 1) samples[i] += source[i] / channels; }
    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < pcm.length; i += 1) { const sample = Math.max(-1, Math.min(1, samples[i])); pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff; }
    const wav = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wav);
    const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true); new Uint8Array(wav, 44).set(new Uint8Array(pcm.buffer));
    return new Blob([wav], { type: "audio/wav" });
  } catch { return blob; } finally { await context.close().catch(() => undefined); }
}

export async function saveBuddyVoiceSample(blob: Blob) {
  const normalized = await normalizeReferenceAudio(blob); const db = await openVoiceDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(normalized, SAMPLE_KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error("Could not save voice sample.")); });
  db.close();
}

export async function getBuddyVoiceSample(): Promise<Blob | null> {
  try {
    const db = await openVoiceDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => { const request = db.transaction(STORE, "readonly").objectStore(STORE).get(SAMPLE_KEY); request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null); request.onerror = () => reject(request.error); });
    db.close(); return blob ? normalizeReferenceAudio(blob) : null;
  } catch { return null; }
}

export async function clearBuddyVoiceSample() {
  try {
    const db = await openVoiceDb();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(SAMPLE_KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  } catch { /* best effort */ }
}

export function getBuddyVoiceProfile(): BuddyVoiceProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(localStorage.getItem(BUDDY_VOICE_KEY) || "null") as Partial<BuddyVoiceProfile> | null;
    const selected = parsed ?? {};
    const preset = BUDDY_VOICE_PRESETS.find((voice) => voice.id === selected.speaker && voice.instruct === selected.instruct) || BUDDY_VOICE_PRESETS.find((voice) => voice.id === selected.speaker);
    return { ...DEFAULT_PROFILE, ...selected, mode: selected.mode === "clone" ? "clone" : "preset", speaker: selected.speaker || DEFAULT_PROFILE.speaker, language: selected.language || DEFAULT_PROFILE.language, mood: selected.mood || DEFAULT_PROFILE.mood, tone: selected.tone || DEFAULT_PROFILE.tone, instruct: selected.instruct || preset?.instruct || DEFAULT_PROFILE.instruct };
  } catch { return DEFAULT_PROFILE; }
}

export function saveBuddyVoiceProfile(profile: BuddyVoiceProfile) { localStorage.setItem(BUDDY_VOICE_KEY, JSON.stringify(profile)); }

export async function clearBuddyVoiceClone() {
  const profile = getBuddyVoiceProfile(); await clearBuddyVoiceSample();
  saveBuddyVoiceProfile({ ...DEFAULT_PROFILE, speaker: profile.speaker || "Ryan", language: profile.language || "English", mood: profile.mood || "natural", tone: profile.tone || "conversational", instruct: profile.instruct || DEFAULT_PROFILE.instruct });
}

export async function fileToVoiceDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error("Could not read the voice sample.")); reader.readAsDataURL(file); });
}
