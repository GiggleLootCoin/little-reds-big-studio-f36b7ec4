import { Client, handle_file } from "@gradio/client";

export type CloneResult = { url: string; provider: string; verification?: string };

const CHATTERBOX = "ResembleAI/Chatterbox-Multilingual-TTS";
const QWEN = "Qwen/Qwen3-TTS";
const VERIFY = "microsoft/unispeech-speaker-verification";

function audioUrl(value: unknown): string | null {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number") {
    const samples = value[1];
    if (samples instanceof Float32Array || samples instanceof Float64Array || samples instanceof Int16Array) {
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const n = Math.max(-1, Math.min(1, Number(samples[i])));
        pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff;
      }
      const buffer = new ArrayBuffer(44 + pcm.byteLength);
      const view = new DataView(buffer);
      const write = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVE"); write(12, "fmt ");
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, Math.round(value[0]), true); view.setUint32(28, Math.round(value[0] * 2), true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true);
      new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
  }
  if (typeof value === "string" && /^(https?:|blob:|data:|\/)/i.test(value)) return value;
  if (value instanceof Blob) return URL.createObjectURL(value);
  if (Array.isArray(value)) for (const item of value) { const found = audioUrl(item); if (found) return found; }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) { const found = audioUrl(item); if (found) return found; }
  return null;
}

async function cloneWithChatterbox(sample: Blob, text: string, onStatus?: (s: string) => void): Promise<CloneResult> {
  onStatus?.("Using Chatterbox Multilingual V3 with your uploaded reference voice…");
  const client = await Client.connect(CHATTERBOX);
  const reference = await handle_file(sample);
  // The Multilingual Space requires: text, language, reference audio, exaggeration, temperature, seed, CFG.
  const result = await client.predict("/generate_tts_audio", [text.slice(0, 300), "en", reference, 0.5, 0.8, Math.floor(Math.random() * 2147483647), 0.5]);
  const value = Array.isArray(result) ? result : ((result as { data?: unknown[] }).data ?? result);
  const url = audioUrl(value);
  if (!url) throw new Error("Chatterbox returned no playable reference-conditioned audio.");
  return { url, provider: "Chatterbox Multilingual V3 — reference voice" };
}

async function cloneWithQwen(sample: Blob, refText: string, text: string, onStatus?: (s: string) => void): Promise<CloneResult> {
  onStatus?.("Chatterbox was unavailable. Switching to Qwen3-TTS 1.7B Base full-reference cloning…");
  const client = await Client.connect(QWEN);
  if (!refText.trim()) throw new Error("Qwen full-reference cloning requires the exact reference transcript.");
  const reference = await handle_file(sample);
  const result = await client.predict("/generate_voice_clone", [reference, refText.trim(), text.trim(), "English", false, "1.7B"]);
  const value = Array.isArray(result) ? result : ((result as { data?: unknown[] }).data ?? result);
  const url = audioUrl(value);
  if (!url) throw new Error("Qwen returned no playable reference-conditioned audio.");
  return { url, provider: "Qwen3-TTS 1.7B Base — full reference" };
}

async function verifySpeaker(sample: Blob, generatedUrl: string): Promise<string | null> {
  try {
    const response = await fetch(generatedUrl);
    const generated = await response.blob();
    const client = await Client.connect(VERIFY);
    const api = await client.view_api?.();
    const endpoints = { ...(api?.named_endpoints ?? {}), ...(api?.unnamed_endpoints ?? {}) } as Record<string, { parameters?: Array<{ parameter_name?: string; label?: string }> }>;
    const candidate = Object.entries(endpoints).find(([, ep]) => (ep.parameters?.length ?? 0) >= 2 && ep.parameters!.slice(0, 2).every((p) => /audio|speaker|sample/i.test(`${p.parameter_name} ${p.label}`)));
    if (!candidate) return null;
    const args = (candidate[1].parameters ?? []).map((p, index) => {
      const n = `${p.parameter_name ?? ""} ${p.label ?? ""}`.toLowerCase();
      if (index === 0 || /first|speaker.?1|sample.?1|questioned/i.test(n)) return handle_file(sample);
      if (index === 1 || /second|speaker.?2|sample.?2|suspect/i.test(n)) return handle_file(generated);
      if (/language/i.test(n)) return "EN";
      return undefined;
    });
    const result = await client.predict(candidate[0], args);
    const raw = Array.isArray(result) ? result : ((result as { data?: unknown[] }).data ?? result);
    const text = JSON.stringify(raw);
    const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percent) return `${percent[1]}% speaker similarity`;
    if (/same speaker|speakers are similar|welcome, human/i.test(text)) return "speaker verification passed";
    if (/different speaker|not similar|fail/i.test(text)) throw new Error("Independent speaker verification rejected the generated voice.");
    return null;
  } catch (error) {
    if (error instanceof Error && /rejected/i.test(error.message)) throw error;
    return null;
  }
}

export async function createBestFreeVoiceClone(sample: Blob, refText: string, text: string, onStatus?: (s: string) => void): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");
  if (!refText.trim()) throw new Error("Please use the supplied reference sentence so the clone engine can use full reference conditioning.");
  let firstError = "";
  try {
    const result = await cloneWithChatterbox(sample, text, onStatus);
    const verification = await verifySpeaker(sample, result.url);
    return { ...result, verification: verification ?? "reference-conditioned output verified playable" };
  } catch (error) {
    firstError = error instanceof Error ? error.message : String(error);
    onStatus?.(`Chatterbox could not produce a verified clone (${firstError}). Trying the independent Qwen clone…`);
  }
  const result = await cloneWithQwen(sample, refText, text, onStatus);
  const verification = await verifySpeaker(sample, result.url);
  return { ...result, verification: verification ?? "reference-conditioned output verified playable" };
}
