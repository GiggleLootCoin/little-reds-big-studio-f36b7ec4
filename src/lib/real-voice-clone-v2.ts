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

export function splitLiveVoiceText(text: string, maxChars = 120): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  const push = (value: string) => {
    const clean = value.trim();
    if (clean) chunks.push(clean);
  };

  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (!current) {
      if (clean.length <= maxChars) current = clean;
      else {
        for (const word of clean.split(" ")) {
          if (!current) current = word;
          else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
          else {
            push(current);
            current = word;
          }
        }
      }
      continue;
    }
    if (`${current} ${clean}`.length <= maxChars) current += ` ${clean}`;
    else {
      push(current);
      current = clean;
    }
  }
  push(current);
  return chunks;
}

async function generateOneVoiceClone(
  sample: Blob,
  refText: string,
  target: string,
  language: string,
  onStatus: ((s: string) => void) | undefined,
  modelSize: "0.6B" | "1.7B",
): Promise<{ blob: Blob; url: string; stats: { duration: number; peak: number; rms: number } }> {
  const id = await referenceId(sample);
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
    modelSize,
  });

  let response = await fetch("/api/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeBody(!alreadyEncoded)),
  });

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
    } catch {}
    throw new Error(detail);
  }

  const generated = await response.blob();
  if (!generated.size) throw new Error("Qwen returned empty generated audio.");
  const normalized = await normalizeAndVerifyBrowserAudio(generated);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Qwen returned silent or unusable audio.");
  return { blob: normalized.blob, url: normalized.url, stats: normalized.stats };
}

function wavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) =>
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0));
  write(0, "RIFF");
  view.setUint32(4, 36 + frames * channels * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++)
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

async function stitchVoiceChunks(urls: string[]): Promise<Blob> {
  if (urls.length === 1) return fetch(urls[0]).then((response) => response.blob());
  const context = new AudioContext();
  try {
    const buffers: AudioBuffer[] = [];
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Generated voice chunk download failed (${response.status}).`);
      buffers.push(await context.decodeAudioData(await response.arrayBuffer()));
    }
    const channels = Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
    const sampleRate = buffers[0].sampleRate;
    const totalFrames = buffers.reduce(
      (sum, buffer) => sum + Math.round(buffer.duration * sampleRate),
      0,
    );
    const combined = context.createBuffer(channels, totalFrames, sampleRate);
    let cursor = 0;
    for (const buffer of buffers) {
      const frames = Math.min(combined.length - cursor, Math.round(buffer.duration * sampleRate));
      for (let channel = 0; channel < channels; channel++) {
        const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        combined.getChannelData(channel).set(source.subarray(0, frames), cursor);
      }
      cursor += frames;
    }
    return wavFromAudioBuffer(combined);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function createBestFreeVoiceClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!refText.trim()) throw new Error("The reference transcript is required.");
  if (!text.trim()) throw new Error("Voice clone target text is empty.");

  const target = text.trim().replace(/\s+/g, " ").slice(0, 220);
  if (!target) throw new Error("Voice clone target text is empty.");

  const chunks = modelSize === "0.6B" ? splitLiveVoiceText(target, 120) : [target];
  const results: Awaited<ReturnType<typeof generateOneVoiceClone>>[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onStatus?.(
      chunks.length > 1
        ? `Generating Buddy's voice ${i + 1} of ${chunks.length}…`
        : "Generating Buddy's voice…",
    );
    results.push(
      await generateOneVoiceClone(sample, refText, chunks[i], language, onStatus, modelSize),
    );
  }

  const stitched = await stitchVoiceChunks(results.map((result) => result.url));
  const normalized = await normalizeAndVerifyBrowserAudio(stitched);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Qwen returned silent or unusable combined audio.");

  const provider = `Qwen3-TTS ${modelSize} Base`;
  await saveBuddyClonePreview(normalized.blob, provider);
  const browserWindow = window as Window & { __buddyLastCloneUrl?: string };
  browserWindow.__buddyLastCloneUrl = normalized.url;
  onStatus?.(`Buddy voice verified: ${normalized.stats.duration.toFixed(2)}s.`);
  return {
    url: normalized.url,
    provider,
    verification: `${provider} reference conditioning + browser audio decode + non-silent artifact verification`,
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
