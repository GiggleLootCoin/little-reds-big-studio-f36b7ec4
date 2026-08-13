export const BUDDY_VOICE_MOODS = [
  "neutral",
  "warm",
  "calm",
  "energetic",
  "playful",
  "serious",
  "cinematic",
  "reassuring",
  "excited",
] as const;

export const BUDDY_VOICE_TONES = [
  "natural",
  "conversational",
  "friendly",
  "professional",
  "gentle",
  "confident",
  "empathetic",
  "direct",
] as const;

export type BuddyVoiceMood = (typeof BUDDY_VOICE_MOODS)[number];
export type BuddyVoiceTone = (typeof BUDDY_VOICE_TONES)[number];

export type BuddyVoiceStyle = {
  mood?: BuddyVoiceMood;
  tone?: BuddyVoiceTone;
  style?: string;
};

/**
 * Optional delivery controls. Empty controls intentionally produce no instruction,
 * so voice generation never depends on mood/tone support.
 */
export function buildBuddyVoiceInstruction(style: BuddyVoiceStyle): string {
  const parts: string[] = [];
  if (style.mood && style.mood !== "neutral") parts.push(`mood: ${style.mood}`);
  if (style.tone && style.tone !== "natural") parts.push(`tone: ${style.tone}`);
  if (style.style?.trim()) parts.push(`style: ${style.style.trim()}`);
  return parts.length ? `Speak naturally with ${parts.join(", ")}.` : "";
}
