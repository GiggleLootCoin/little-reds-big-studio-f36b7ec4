import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";
import { createLocalChatterboxClone } from "./local-chatterbox";

export type CloneResult = {
  url: string;
  provider: string;
  verification: string;
  duration: number;
  peak: number;
  rms: number;
};

/**
 * API-keyless voice cloning path.
 *
 * The reference recording is passed directly to the local Chatterbox encoder
 * running in the browser. There is deliberately no remote/public Space
 * fallback here: if local Chatterbox cannot run, the clone fails honestly.
 */
export async function createBestFreeVoiceClone(
  sample: Blob,
  _refText: string,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!text.trim()) throw new Error("Voice clone target text is empty.");

  onStatus?.(
    "Preparing your actual reference recording for local Chatterbox — no preset speaker or remote Space is being used…",
  );

  const local = await createLocalChatterboxClone(sample, text, 0.5, onStatus);
  try {
    onStatus?.("Checking the locally generated clone for real, playable audio…");
    const artifact = await fetch(local.url).then((response) => {
      if (!response.ok) throw new Error(`Local Chatterbox audio could not be read (${response.status}).`);
      return response.blob();
    });
    const normalized = await normalizeAndVerifyBrowserAudio(artifact);
    if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
      throw new Error("Local Chatterbox returned silent or unusable audio.");

    const provider = "Chatterbox Turbo local — WebGPU";
    await saveBuddyClonePreview(normalized.blob, provider);
    const browserWindow = window as Window & { __buddyLastCloneUrl?: string };
    browserWindow.__buddyLastCloneUrl = normalized.url;
    onStatus?.(
      `Clone audio verified: ${normalized.stats.duration.toFixed(2)}s, peak ${normalized.stats.peak.toFixed(3)}, RMS ${normalized.stats.rms.toFixed(4)}.`,
    );
    return {
      url: normalized.url,
      provider,
      verification: "browser-local Chatterbox reference conditioning + audio decode + non-silent artifact verification",
      duration: normalized.stats.duration,
      peak: normalized.stats.peak,
      rms: normalized.stats.rms,
    };
  } finally {
    URL.revokeObjectURL(local.url);
  }
}
