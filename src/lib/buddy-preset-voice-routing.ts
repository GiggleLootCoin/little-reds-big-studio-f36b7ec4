export type BuddyPresetRoutingProfile = {
  mode: "preset" | "clone";
  speaker: string;
  language?: string;
  mood?: string;
  tone?: string;
};

export type BuddyPresetTtsRequest = {
  route: "preset";
  speaker: string;
  text: string;
  language?: string;
  mood?: string;
  tone?: string;
};

/**
 * Keep one canonical speaker representation at the browser/runtime boundary.
 * The UI may hand us either a raw Aura name ("apollo") or the documented
 * Aura-2 model id ("aura-2-apollo-en"). The production Worker accepts the
 * raw speaker name, so normalize both forms to that stable value here.
 */
export function normalizeBuddyPresetSpeaker(value: string): string {
  const speaker = String(value || "").trim();
  if (!speaker) return "";
  const match = speaker.match(/^aura-2-([a-z0-9_]+)-(en|es)$/i);
  return match ? match[1] : speaker;
}

/**
 * An explicitly selected non-Red speaker is authoritative even if an older
 * saved clone profile still says mode=clone. Presets must never carry a Red
 * reference audio blob into the speech request.
 */
export function buildPresetTtsRequest(
  profile: BuddyPresetRoutingProfile,
  text: string,
): BuddyPresetTtsRequest {
  const speaker = normalizeBuddyPresetSpeaker(profile.speaker);
  const clean = text.trim();
  if (!speaker || speaker === "Red") throw new Error("A non-Red preset speaker is required.");
  if (!clean) throw new Error("Preset voice text is empty.");
  return {
    route: "preset",
    speaker,
    text: clean,
    language: profile.language || "English",
    mood: profile.mood || "natural",
    tone: profile.tone || "conversational",
  };
}
