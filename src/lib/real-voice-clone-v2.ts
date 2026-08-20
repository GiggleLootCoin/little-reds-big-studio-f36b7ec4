import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";
import { createQwen3TTSClone } from "./qwen3-tts-clone";

export type CloneResult = {
  url: string;
  provider: string;
  verification: string;
  duration: number;
  peak: number;
  rms: number;
};

/**
 * Real reference-voice cloning path for Buddy.
 *
 * Qwen3-TTS Base performs the cloning from the user's reference recording
 * and exact transcript. Chatterbox remains in the repository as legacy code
 * but is deliberately not part of this production clone path.
 */
export async function createBestFreeVoiceClone(
  sample: Blob,
  refText: string,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!refText.trim()) throw new Error("The exact reference transcript is required for a real clone.");
  if (!text.trim()) throw new Error("Voice clone target text is empty.");

  onStatus?.(
    "Preparing your actual reference recording for Qwen3-TTS Base — no preset speaker is being used.",
  );

  const result = await createQwen3TTSClone(sample, refText, text, onStatus);
  if (!result.url) throw new Error("Qwen3-TTS returned no playable cloned audio.");

  try {
    const artifact = await fetch(result.url).then((response) => {
      if (!response.ok) throw new Error(`Qwen clone audio could not be read (${response.status}).`);
      return response.blob();
    });
    const normalized = await normalizeAndVerifyBrowserAudio(artifact);
    if (
      normalized.stats.duration <= 0 ||
      normalized.stats.peak <= 0 ||
      normalized.stats.rms <= 0
    ) {
      URL.revokeObjectURL(normalized.url);
      throw new Error("Qwen3-TTS returned silent or unusable audio.");
    }

    URL.revokeObjectURL(result.url);
    await saveBuddyClonePreview(normalized.blob, result.provider);
    onStatus?.(
      `Clone audio verified: ${normalized.stats.duration.toFixed(2)}s, peak ${normalized.stats.peak.toFixed(3)}, RMS ${normalized.stats.rms.toFixed(4)}.`,
    );
    return {
      url: normalized.url,
      provider: result.provider,
      verification: result.verification,
      duration: normalized.stats.duration,
      peak: normalized.stats.peak,
      rms: normalized.stats.rms,
    };
  } catch (error) {
    URL.revokeObjectURL(result.url);
    throw error;
  }
}
