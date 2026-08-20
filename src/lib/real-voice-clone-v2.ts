import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";

export type CloneResult = {
  url: string;
  provider: string;
  verification: string;
  duration: number;
  peak: number;
  rms: number;
};

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("The reference recording could not be encoded."));
      else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("The reference recording could not be read."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Production browser voice-cloning path.
 *
 * The actual reference recording and its transcript are sent to the
 * server-side Qwen3-TTS 0.6B gateway. The returned audio is not considered
 * usable until the existing browser safety verifier accepts the exact Blob.
 */
export async function createBestFreeVoiceClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!refText.trim()) throw new Error("The reference transcript is required.");
  if (!text.trim()) throw new Error("Voice clone target text is empty.");

  onStatus?.("Sending your actual reference recording to Qwen3-TTS 0.6B…");
  const response = await fetch("/api/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      audioBase64: await blobBase64(sample),
      audioType: sample.type || "audio/wav",
      refText: refText.trim(),
      text: text.trim(),
      language: language || "English",
    }),
  });
  if (!response.ok) {
    let detail = `Qwen voice cloning failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      // Keep the status-only failure when the gateway did not return JSON.
    }
    throw new Error(detail);
  }

  const generated = await response.blob();
  if (!generated.size) throw new Error("Qwen returned empty generated audio.");

  onStatus?.("Checking the Qwen-generated clone for real, playable audio…");
  const normalized = await normalizeAndVerifyBrowserAudio(generated);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Qwen returned silent or unusable audio.");

  const provider = "Qwen3-TTS 0.6B Base";
  await saveBuddyClonePreview(normalized.blob, provider);
  const browserWindow = window as Window & { __buddyLastCloneUrl?: string };
  browserWindow.__buddyLastCloneUrl = normalized.url;
  onStatus?.(
    `Clone audio verified: ${normalized.stats.duration.toFixed(2)}s, peak ${normalized.stats.peak.toFixed(3)}, RMS ${normalized.stats.rms.toFixed(4)}.`,
  );
  return {
    url: normalized.url,
    provider,
    verification:
      "Qwen3-TTS 0.6B reference conditioning + browser audio decode + non-silent artifact verification",
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
