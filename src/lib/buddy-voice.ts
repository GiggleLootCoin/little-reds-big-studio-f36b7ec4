export type BuddyVoiceMode = "preset" | "clone";
export type BuddyVoiceProfile = {
  mode: BuddyVoiceMode;
  speaker: string;
  language: string;
  referenceDataUrl?: string;
  referenceName?: string;
};

export const BUDDY_VOICE_KEY = "lrbgs-buddy-voice-v1";
export const BUDDY_VOICE_PRESETS = [
  { id: "Ryan", label: "Ryan", note: "English • dynamic, rhythmic" },
  { id: "Aiden", label: "Aiden", note: "English • sunny, clear American" },
  { id: "Vivian", label: "Vivian", note: "Bright, slightly edgy" },
  { id: "Serena", label: "Serena", note: "Warm, gentle" },
  { id: "Uncle_Fu", label: "Uncle Fu", note: "Low, mellow" },
  { id: "Dylan", label: "Dylan", note: "Clear, youthful" },
  { id: "Eric", label: "Eric", note: "Lively, slightly husky" },
  { id: "Ono_anna", label: "Ono Anna", note: "Playful, light" },
  { id: "Sohee", label: "Sohee", note: "Warm, emotional" },
] as const;

const DEFAULT_PROFILE: BuddyVoiceProfile = { mode: "preset", speaker: "Ryan", language: "English" };
const DB_NAME = "little-reds-big-studio";
const STORE = "voice-profile";
const SAMPLE_KEY = "buddy-voice-sample";

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

export async function saveBuddyVoiceSample(blob: Blob): Promise<void> {
  const db = await openVoiceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, SAMPLE_KEY);
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
    return blob;
  } catch {
    return null;
  }
}

export async function clearBuddyVoiceSample(): Promise<void> {
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
    /* best effort */
  }
}

export function getBuddyVoiceProfile(): BuddyVoiceProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(localStorage.getItem(BUDDY_VOICE_KEY) || "null") as Partial<BuddyVoiceProfile> | null;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      mode: parsed?.mode === "clone" ? "clone" : "preset",
      speaker: parsed?.speaker || DEFAULT_PROFILE.speaker,
      language: parsed?.language || DEFAULT_PROFILE.language,
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
  saveBuddyVoiceProfile({ mode: "preset", speaker: profile.speaker || "Ryan", language: profile.language || "English" });
}

export async function fileToVoiceDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read the voice sample."));
    reader.readAsDataURL(file);
  });
}
