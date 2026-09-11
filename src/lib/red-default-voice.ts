const BUILT_IN_RED_VOICE_URLS = [
  "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/main/RED_V2_TRAINING_FINAL.wav",
  "/red_voice_mic_device10_30s_C.wav",
  "/red_voice_mic_device10_20s_D.wav",
] as const;

const RED_REFERENCE_SECONDS = 6;
let cachedSample: Blob | null = null;
let loadingSample: Promise<Blob | null> | null = null;

async function compactReference(blob: Blob): Promise<Blob> {
  if (blob.size < 8_000_000 || typeof window === "undefined" || typeof AudioContext === "undefined")
    return blob;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const duration = Math.min(buffer.duration, RED_REFERENCE_SECONDS);
    if (!Number.isFinite(duration) || duration <= 0) return blob;
    const channels = Math.min(buffer.numberOfChannels, 2);
    const frameCount = Math.max(1, Math.floor(duration * buffer.sampleRate));
    const pcm = new Int16Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      let sample = 0;
      for (let channel = 0; channel < channels; channel++)
        sample += buffer.getChannelData(channel)[i] / channels;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const wav = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wav);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(wav, 44).set(new Uint8Array(pcm.buffer));
    return new Blob([wav], { type: "audio/wav" });
  } catch {
    return blob;
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function getBuiltInRedVoiceSample(): Promise<Blob | null> {
  if (cachedSample?.size) return cachedSample;
  if (typeof window === "undefined") return null;
  if (!loadingSample) {
    loadingSample = (async () => {
      for (const url of BUILT_IN_RED_VOICE_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (!blob.size) continue;
          cachedSample = await compactReference(blob);
          return cachedSample;
        } catch {}
      }
      return null;
    })().finally(() => {
      loadingSample = null;
    });
  }
  return loadingSample;
}
