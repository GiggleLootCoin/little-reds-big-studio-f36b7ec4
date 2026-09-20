import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const MODEL_URL = "https://drive.google.com/uc?id=19yLeLybGU8csalpLFuK6ORSS3aqaDkrW";
const SOURCE_URL =
  "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/feat/studio-production-completion/13.7s%20Recording%20%28Jul%202%20%40%205_53%20PM%29.mp3";

const MIN_AUDIO_BYTES = 256;

function readAscii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function validateWav(bytes) {
  if (bytes.byteLength < 44 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    throw new Error("RVC output is not a valid RIFF/WAVE file.");
  }
  let offset = 12;
  let audioFormat = null;
  let channels = null;
  let bitsPerSample = null;
  let dataStart = null;
  let dataLength = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const chunkStart = offset + 8;
    if (chunkStart + size > bytes.byteLength) throw new Error("RVC WAV contains a truncated chunk.");
    if (id === "fmt " && size >= 16) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + chunkStart, size);
      audioFormat = view.getUint16(0, true);
      channels = view.getUint16(2, true);
      bitsPerSample = view.getUint16(14, true);
    } else if (id === "data") {
      dataStart = chunkStart;
      dataLength = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }
  if (audioFormat !== 1 || !channels || !bitsPerSample || dataStart === null || dataLength === null) {
    throw new Error("RVC WAV is missing supported PCM audio metadata.");
  }
  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error(`RVC WAV uses unsupported PCM depth: ${bitsPerSample} bits.`);
  }
  let peak = 0;
  const end = Math.min(dataStart + dataLength, bytes.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bitsPerSample === 8) {
    for (let i = dataStart; i < end; i++) peak = Math.max(peak, Math.abs(bytes[i] - 128));
  } else if (bitsPerSample === 16) {
    for (let i = dataStart; i + 1 < end; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  } else if (bitsPerSample === 24) {
    for (let i = dataStart; i + 2 < end; i += 3) {
      let sample = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
      if (sample & 0x800000) sample |= 0xff000000;
      peak = Math.max(peak, Math.abs(sample));
    }
  } else {
    for (let i = dataStart; i + 3 < end; i += 4) peak = Math.max(peak, Math.abs(view.getInt32(i, true)));
  }
  if (peak === 0) throw new Error("RVC produced a silent WAV; real voice conversion did not occur.");
  return { channels, bitsPerSample, dataBytes: dataLength, peak };
}

const modelPath = path.join(os.tmpdir(), "RedsVoiceSwap_53e_424s.pth");
const sourceDownload = path.join(os.tmpdir(), "red-rvc-source.mp3");
const sourceClip = path.join(os.tmpdir(), "red-rvc-source-clip.wav");
const outputPath = path.join(os.tmpdir(), "red-rvc-output.wav");

console.log("Downloading the real Red RVC model with gdown…");
try {
  execFileSync("python", ["-m", "gdown", MODEL_URL, "-O", modelPath], { stdio: "inherit", timeout: 180_000 });
} catch {
  execFileSync("python", ["-m", "pip", "install", "-q", "gdown"], { stdio: "inherit", timeout: 120_000 });
  execFileSync("python", ["-m", "gdown", MODEL_URL, "-O", modelPath], { stdio: "inherit", timeout: 180_000 });
}

const fs = await import("node:fs/promises");
const modelSize = Number((await fs.stat(modelPath)).size);
await fs.writeFile(sourceDownload, new Uint8Array(await (await fetch(SOURCE_URL)).arrayBuffer()));
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", sourceDownload, "-t", "1", "-ac", "1", "-ar", "40000", sourceClip], {
  stdio: "inherit",
  timeout: 60_000,
});
const sourceBytes = await fs.readFile(sourceClip);
if (!sourceBytes.byteLength) throw new Error("The source vocal clip was empty.");
if (modelSize < 50_000_000) throw new Error(`The Red RVC model download is incomplete: ${modelSize} bytes.`);

try {
  execFileSync("python", ["-c", "import infer_rvc_python"], { stdio: "ignore", timeout: 30_000 });
} catch {
  execFileSync("python", ["-m", "pip", "install", "-q", "infer_rvc_python==1.3.1"], { stdio: "inherit", timeout: 300_000 });
}

const pythonSmoke = `
import sys, soundfile as sf
from infer_rvc_python import BaseLoader
model, source, output = sys.argv[1:4]
loader = BaseLoader(only_cpu=True, hubert_path=None, rmvpe_path=None)
tag = "red-live-smoke"
loader.apply_conf(
    tag=tag,
    file_model=model,
    pitch_algo="pm",
    pitch_lvl=0,
    file_index=None,
    index_influence=0.0,
    respiration_median_filtering=0,
    envelope_ratio=0.25,
    consonant_breath_protection=0.33,
    resample_sr=0,
)
audio, sample_rate = loader.generate_from_cache(audio_data=source, tag=tag)
sf.write(output, audio, sample_rate)
print({"sample_rate": sample_rate, "samples": len(audio)})
`;

console.log("Running genuine local RVC-v2 inference with the real Red checkpoint…");
execFileSync("python", ["-c", pythonSmoke, modelPath, sourceClip, outputPath], {
  stdio: "inherit",
  timeout: 360_000,
});

const outputBytes = new Uint8Array(await fs.readFile(outputPath));
if (outputBytes.byteLength < MIN_AUDIO_BYTES) {
  throw new Error(`RVC output was too small: ${outputBytes.byteLength} bytes`);
}
const wav = validateWav(outputBytes);
console.log(JSON.stringify({
  status: "ok",
  provider: "infer_rvc_python (RVC)",
  model: "RedsVoiceSwap_53e_424s.pth",
  outputBytes: outputBytes.byteLength,
  wav,
}));
