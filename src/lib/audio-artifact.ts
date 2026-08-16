export type AudioArtifactStats = {
  container: "wav";
  sampleRate: number;
  channels: number;
  frames: number;
  duration: number;
  peak: number;
  rms: number;
};

type Pcm16WavParts = {
  sampleRate: number;
  channels: number;
  frames: number;
  data: Uint8Array;
};

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function readPcm16WavParts(bytes: Uint8Array): Pcm16WavParts {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("Audio artifact is not a RIFF/WAVE container.");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const chunkStart = offset + 8;
    if (chunkStart + size > bytes.length) throw new Error("WAV chunk exceeds artifact bounds.");
    if (id === "fmt ") {
      if (size < 16) throw new Error("WAV fmt chunk is truncated.");
      const view = new DataView(bytes.buffer, bytes.byteOffset + chunkStart, size);
      const format = view.getUint16(0, true);
      channels = view.getUint16(2, true);
      sampleRate = view.getUint32(4, true);
      bitsPerSample = view.getUint16(14, true);
      if (format !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 8000) {
        throw new Error("WAV is not PCM16 audio supported by the verifier.");
      }
    } else if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
    }
    offset = chunkStart + size + (size % 2);
  }
  if (!sampleRate || !channels || dataOffset < 0 || dataSize < channels * 2) {
    throw new Error("WAV audio data is incomplete.");
  }
  const bytesPerFrame = channels * 2;
  const frames = Math.floor(dataSize / bytesPerFrame);
  const exactDataSize = frames * bytesPerFrame;
  const data = new Uint8Array(exactDataSize);
  data.set(bytes.subarray(dataOffset, dataOffset + exactDataSize));
  return { sampleRate, channels, frames, data };
}

export function inspectPcm16Wav(bytes: Uint8Array): AudioArtifactStats {
  const { sampleRate, channels, frames, data } = readPcm16WavParts(bytes);
  const bytesPerFrame = channels * 2;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const step = Math.max(1, Math.floor(frames / 200000));
  let sumSquares = 0;
  let peak = 0;
  let samplesChecked = 0;
  for (let frame = 0; frame < frames; frame += step) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = view.getInt16((frame * channels + channel) * 2, true) / 32768;
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      sumSquares += sample * sample;
      samplesChecked++;
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samplesChecked));
  const duration = frames / sampleRate;
  if (!Number.isFinite(duration) || duration <= 0.25) {
    throw new Error("Audio artifact has no usable duration.");
  }
  if (peak < 0.005 || rms < 0.0005) {
    throw new Error("Audio artifact is silent or effectively silent.");
  }
  return { container: "wav", sampleRate, channels, frames, duration, peak, rms };
}

export function canonicalizePcm16Wav(bytes: Uint8Array): Uint8Array {
  const { sampleRate, channels, data } = readPcm16WavParts(bytes);
  const blockAlign = channels * 2;
  const dataSize = data.byteLength;
  const canonical = new Uint8Array(44 + dataSize);
  const view = new DataView(canonical.buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) canonical[offset + i] = value.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  canonical.set(data, 44);
  return canonical;
}

export function encodePcm16Wav(buffer: {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}): Uint8Array {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const frames = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }
  return bytes;
}

export async function normalizeAndVerifyBrowserAudio(
  blob: Blob,
): Promise<{ blob: Blob; url: string; stats: AudioArtifactStats }> {
  if (!blob.size) throw new Error("Generated clone returned an empty audio artifact.");
  const arrayBuffer = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0.25) {
      throw new Error("Generated clone has no usable duration.");
    }
    let peak = 0;
    let sumSquares = 0;
    let count = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      const step = Math.max(1, Math.floor(samples.length / 200000));
      for (let i = 0; i < samples.length; i += step) {
        const sample = samples[i];
        const abs = Math.abs(sample);
        peak = Math.max(peak, abs);
        sumSquares += sample * sample;
        count++;
      }
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    if (peak < 0.005 || rms < 0.0005) {
      throw new Error("Generated clone decoded successfully but is silent.");
    }
    const wavBytes = encodePcm16Wav(decoded);
    const wavBuffer = new ArrayBuffer(wavBytes.byteLength);
    new Uint8Array(wavBuffer).set(wavBytes);
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
    const stats = inspectPcm16Wav(wavBytes);
    const url = URL.createObjectURL(wavBlob);
    const player = new Audio();
    player.preload = "auto";
    player.src = url;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Android audio element did not load the generated clone.")),
        10000,
      );
      player.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        if (!Number.isFinite(player.duration) || player.duration <= 0.25) {
          reject(new Error("Android audio element reported no usable duration."));
        } else {
          resolve();
        }
      };
      player.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Android audio element could not decode the generated clone."));
      };
      player.load();
    });
    return { blob: wavBlob, url, stats };
  } finally {
    void context.close();
  }
}
