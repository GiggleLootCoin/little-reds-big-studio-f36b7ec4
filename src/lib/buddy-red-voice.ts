import { getBuddyVoiceProfile, getBuddyVoiceSample } from "./buddy-voice";
import { getBuiltInRedVoiceSample } from "./red-default-voice";
import { createBestFreeVoiceClone } from "./real-voice-clone-v2";

export type RedSpeechResult = { url: string; provider: string };

/**
 * Buddy's default "Red" voice.
 *
 * This path is deliberately isolated from the generic free-provider pool in
 * studio-runtime-impl. Red must NEVER be produced by ResembleAI /
 * Chatterbox-Multilingual or any other space that can answer with its own
 * canned demo phrase when the reference audio is missing. It always sends the
 * Red reference audio (referenceId + audioBase64 + refText) to the proven
 * /api/voice-clone gateway, and fails honestly if that engine cannot deliver.
 */
export async function resolveRedReference(): Promise<Blob> {
  const saved = await getBuddyVoiceSample();
  if (saved?.size) return saved;
  const builtIn = await getBuiltInRedVoiceSample();
  if (builtIn?.size) return builtIn;
  throw new Error(
    "Buddy's Red voice reference audio could not be loaded, so no speech was generated.",
  );
}

export function isRedVoice(profile = getBuddyVoiceProfile()): boolean {
  return profile.mode === "clone" || profile.speaker === "Red";
}

export async function speakAsBuddyRed(
  text: string,
  options: { language?: string; refText?: string; modelSize?: "0.6B" | "1.7B" } = {},
  onStatus?: (status: string) => void,
): Promise<RedSpeechResult> {
  const spoken = text.trim();
  if (!spoken) throw new Error("There was nothing for Buddy to say.");
  const profile = getBuddyVoiceProfile();
  const reference = await resolveRedReference();
  const refText = (options.refText ?? profile.referenceTranscript ?? "").trim();
  onStatus?.("Speaking in Buddy's Red voice…");
  const result = await createBestFreeVoiceClone(
    reference,
    refText,
    spoken,
    options.language || profile.language || "English",
    onStatus,
    options.modelSize ?? "0.6B",
    false,
  );
  if (!result.url)
    throw new Error("Buddy's Red voice engine returned no audio. Nothing else was played.");
  return { url: result.url, provider: result.provider };
}
