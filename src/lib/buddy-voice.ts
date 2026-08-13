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

export function getBuddyVoiceProfile(): BuddyVoiceProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(BUDDY_VOICE_KEY) || "null",
    ) as Partial<BuddyVoiceProfile> | null;
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

export function clearBuddyVoiceClone() {
  const profile = getBuddyVoiceProfile();
  saveBuddyVoiceProfile({
    mode: "preset",
    speaker: profile.speaker || "Ryan",
    language: profile.language || "English",
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
