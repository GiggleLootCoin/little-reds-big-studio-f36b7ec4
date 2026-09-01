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

let cachedReferenceId = "";
let cachedReferenceBase64 = "";

async function referenceId(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

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

  const id = await referenceId(sample);
  const target = text.trim().replace(/\s+/g, " ").slice(0, 420);
  if (!target) throw new Error("Voice clone target text is empty.");

  const alreadyEncoded = cachedReferenceId === id && cachedReferenceBase64.length > 0;
  if (!alreadyEncoded) {
    cachedReferenceBase64 = await blobBase64(sample);
    cachedReferenceId = id;
  }

  const makeBody = (includeAudio: boolean) => ({
    referenceId: id,
    ...(includeAudio ? { audioBase64: cachedReferenceBase64 } : {}),
    audioType: sample.type || "audio/wav",
    refText: refText.trim(),
    text: target,
    language: language || "English",
  });

  onStatus?.(
    alreadyEncoded ? "Using Buddy's saved voice reference…" : "Preparing Buddy's voice reference…",
  );
  let response = await fetch("/api/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeBody(!alreadyEncoded)),
  });

  // A Cloudflare Worker isolate may have gone cold between replies. Refresh
  // the server-side reference only when it explicitly reports a cache miss.
  if (response.status === 428) {
    onStatus?.("Refreshing Buddy's voice reference…");
    response = await fetch("/api/voice-clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeBody(true)),
    });
  }

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

  onStatus?.("Checking the generated clone for real, playable audio…");
  const normalized = await normalizeAndVerifyBrowserAudio(generated);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Qwen returned silent or unusable audio.");

  const provider = "Qwen3-TTS 1.7B Base";
  await saveBuddyClonePreview(normalized.blob, provider);
  const browserWindow = window as Window & { __buddyLastCloneUrl?: string };
  browserWindow.__buddyLastCloneUrl = normalized.url;
  onStatus?.(`Clone audio verified: ${normalized.stats.duration.toFixed(2)}s.`);
  return {
    url: normalized.url,
    provider,
    verification:
      "Qwen3-TTS 1.7B reference conditioning + browser audio decode + non-silent artifact verification",
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
