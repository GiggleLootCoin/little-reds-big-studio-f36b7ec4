export type RealCloneResult = { url: string; provider: string; voiceId?: string };

const DEFAULT_CLONE_TEXT =
  "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

function validateAudioBlob(blob: Blob): void {
  if (!blob.size || blob.size < 4096) {
    throw new Error("The voice clone engine returned empty or unusably small audio.");
  }
}

async function blobToWav(blob: Blob): Promise<Blob> {
  if (blob.type.toLowerCase().includes("wav")) return blob;
  const AudioContextCtor = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This browser cannot convert the recording to WAV.");
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const sampleRate = 24000;
    const length = Math.max(1, Math.ceil(decoded.duration * sampleRate));
    const offline = new OfflineAudioContext(1, length, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const wav = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(wav);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function generateWithRealClone(reference: Blob, text: string): Promise<Blob> {
  const wav = await blobToWav(reference);
  if (wav.size < 4096) throw new Error("The voice sample is too short to clone.");
  const audioBase64 = await blobToBase64(wav);
  const response = await fetch("/api/ai/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioBase64, text: text.trim() || DEFAULT_CLONE_TEXT }),
  });
  if (!response.ok) {
    let message = "Voice cloning failed.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      const detail = await response.text().catch(() => "");
      if (detail) message = detail.slice(0, 500);
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  validateAudioBlob(blob);
  return blob;
}

export async function createRealVoiceClone(
  reference: Blob,
  _refText = "",
  text = DEFAULT_CLONE_TEXT,
  _language = "English",
): Promise<RealCloneResult> {
  if (!reference.size) throw new Error("The voice recording is empty.");
  const blob = await generateWithRealClone(reference, text || DEFAULT_CLONE_TEXT);
  return { url: URL.createObjectURL(blob), provider: "Chatterbox — Resemble AI voice clone" };
}

export async function speakWithRealVoiceClone(
  reference: Blob,
  refText = "",
  text = DEFAULT_CLONE_TEXT,
  language = "English",
): Promise<RealCloneResult> {
  return createRealVoiceClone(reference, refText, text, language);
}
