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
 * An explicit non-Red speaker is authoritative even if an older saved clone
 * profile still says mode=clone. Presets must never carry a Red reference audio
 * blob into the speech request.
 */
export function buildPresetTtsRequest(
  profile: BuddyPresetRoutingProfile,
  text: string,
): BuddyPresetTtsRequest {
  const speaker = String(profile.speaker || "").trim();
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
