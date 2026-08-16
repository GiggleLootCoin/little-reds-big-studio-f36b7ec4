import { Client, handle_file } from "@gradio/client";

export type CloneResult = { url: string; provider: string; verification: string };

const QWEN = "Qwen/Qwen3-TTS";
const CHATTERBOX = "ResembleAI/Chatterbox-Multilingual-TTS";
const VERIFY = "microsoft/unispeech-speaker-verification";

function audioUrl(value: unknown): string | null {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number") {
    const samples = value[1];
    if (
      samples instanceof Float32Array ||
      samples instanceof Float64Array ||
      samples instanceof Int16Array
    ) {
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const n = Math.max(-1, Math.min(1, Number(samples[i])));
        pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
      }
      const buffer = new ArrayBuffer(44 + pcm.byteLength);
      const view = new DataView(buffer);
      const write = (at: number, text: string) =>
        [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      write(0, "RIFF");
      view.setUint32(4, 36 + pcm.byteLength, true);
      write(8, "WAVE");
      write(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, Math.round(value[0]), true);
      view.setUint32(28, Math.round(value[0] * 2), true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, "data");
      view.setUint32(40, pcm.byteLength, true);
      new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
  }
  if (typeof value === "string" && /^(https?:|blob:|data:|\/)/i.test(value)) return value;
  if (value instanceof Blob) return URL.createObjectURL(value);
  if (Array.isArray(value))
    for (const item of value) {
      const found = audioUrl(item);
      if (found) return found;
    }
  if (value && typeof value === "object")
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = audioUrl(item);
      if (found) return found;
    }
  return null;
}

function resultData(result: unknown): unknown {
  return Array.isArray(result) ? result : ((result as { data?: unknown[] })?.data ?? result);
}

async function cloneWithQwen(
  sample: Blob,
  refText: string,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  onStatus?.("Using Qwen3-TTS 1.7B Base full-reference cloning with your actual voice sample…");
  if (!refText.trim())
    throw new Error("Qwen full-reference cloning requires the exact reference transcript.");
  const client = await Client.connect(QWEN);
  const reference = await handle_file(sample);
  const result = await client.predict("/generate_voice_clone", [
    reference,
    refText.trim(),
    text.trim(),
    "English",
    false,
    "1.7B",
  ]);
  const url = audioUrl(resultData(result));
  if (!url) throw new Error("Qwen returned no playable reference-conditioned audio.");
  return { url, provider: "Qwen3-TTS 1.7B Base — full reference", verification: "" };
}

async function cloneWithChatterbox(
  sample: Blob,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  onStatus?.(
    "Qwen was unavailable. Trying Chatterbox Multilingual with your actual reference audio…",
  );
  const client = await Client.connect(CHATTERBOX);
  const reference = await handle_file(sample);
  const result = await client.predict("/generate_tts_audio", [
    text.slice(0, 300),
    "en",
    reference,
    0.5,
    0.8,
    0,
    0.5,
  ]);
  const url = audioUrl(resultData(result));
  if (!url) throw new Error("Chatterbox returned no playable reference-conditioned audio.");
  return { url, provider: "Chatterbox Multilingual — reference audio", verification: "" };
}

async function verifySpeaker(sample: Blob, generatedUrl: string): Promise<string> {
  const response = await fetch(generatedUrl);
  if (!response.ok)
    throw new Error("Generated clone audio could not be read back for verification.");
  const generated = await response.blob();
  const client = await Client.connect(VERIFY);
  const api = await client.view_api?.();
  const endpoints = {
    ...(api?.named_endpoints ?? {}),
    ...(api?.unnamed_endpoints ?? {}),
  } as Record<string, { parameters?: Array<{ parameter_name?: string; label?: string }> }>;
  const candidate = Object.entries(endpoints).find(
    ([, ep]) =>
      (ep.parameters?.length ?? 0) >= 2 &&
      ep
        .parameters!.slice(0, 2)
        .every((p) => /audio|speaker|sample/i.test(`${p.parameter_name} ${p.label}`)),
  );
  if (!candidate)
    throw new Error(
      "Independent speaker verification is unavailable; the clone cannot be marked verified.",
    );
  const args = (candidate[1].parameters ?? []).map((p, index) => {
    const n = `${p.parameter_name ?? ""} ${p.label ?? ""}`.toLowerCase();
    if (index === 0 || /first|speaker.?1|sample.?1|questioned/i.test(n)) return handle_file(sample);
    if (index === 1 || /second|speaker.?2|sample.?2|suspect/i.test(n))
      return handle_file(generated);
    if (/language/i.test(n)) return "EN";
    return undefined;
  });
  const result = resultData(await client.predict(candidate[0], args));
  const text = JSON.stringify(result);
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const score = Number(percent[1]);
    if (score < 70)
      throw new Error(`Speaker verification rejected the clone (${score}% similarity).`);
    return `${score}% speaker similarity`;
  }
  if (/same speaker|speakers are similar|welcome, human/i.test(text))
    return "speaker verification passed";
  throw new Error(
    "Independent speaker verification did not confirm that the generated audio matches the uploaded voice.",
  );
}

export async function createBestFreeVoiceClone(
  sample: Blob,
  refText: string,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!refText.trim())
    throw new Error(
      "Please use the supplied reference sentence so the clone engine can use full reference conditioning.",
    );
  let qwenError = "";
  try {
    const result = await cloneWithQwen(sample, refText, text, onStatus);
    result.verification = await verifySpeaker(sample, result.url);
    return result;
  } catch (error) {
    qwenError = error instanceof Error ? error.message : String(error);
    onStatus?.(`Qwen clone was not independently verified (${qwenError}). Trying Chatterbox…`);
  }
  const result = await cloneWithChatterbox(sample, text, onStatus);
  try {
    result.verification = await verifySpeaker(sample, result.url);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No genuine voice clone was verified. Qwen: ${qwenError}. Chatterbox: ${reason}`,
    );
  }
}
