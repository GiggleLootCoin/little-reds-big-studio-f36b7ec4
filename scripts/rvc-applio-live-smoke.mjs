import { Client, handle_file } from "@gradio/client";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

// The original ApplioX Space currently accepts the request but returns only a
// generic server error during inference. Use a live RVC-v2 Space that exposes
// the same real .pth conversion path and returns its server-side status text.
// This is still genuine RVC inference; the smoke test must never substitute a
// TTS clone or synthetic placeholder for the Red checkpoint.
const SPACE = "Luminia/rvc-beatrice-voice-conversion";
const MODEL_URL = "https://drive.google.com/uc?id=19yLeLybGU8csalpLFuK6ORSS3aqaDkrW";
const SOURCE_URL =
  "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/feat/studio-production-completion/13.7s%20Recording%20%28Jul%202%20%40%205_53%20PM%29.mp3";
const MIN_AUDIO_BYTES = 256;
let modelPath = "";
let modelBytes = null;
let sourceBytes = null;

const labelFor = (parameter) =>
  `${parameter.label ?? ""} ${parameter.parameter_name ?? ""}`.toLowerCase();

function hasRvcInputs(endpoint) {
  const labels = (endpoint.parameters ?? []).map(labelFor);
  return (
    labels.some((label) => label.includes("source audio")) &&
    labels.some((label) => label.includes("rvc model")) &&
    labels.some((label) => label.includes("model type"))
  );
}

function findEndpoint(api) {
  const entries = [
    ...Object.entries(api.named_endpoints ?? {}),
    ...Object.entries(api.unnamed_endpoints ?? {}),
  ];
  const preferred = entries.find(([name, endpoint]) =>
    name.toLowerCase().includes("convert") && hasRvcInputs(endpoint),
  );
  if (preferred) return preferred;
  const fallback = entries.find(([, endpoint]) => hasRvcInputs(endpoint));
  if (fallback) return fallback;
  throw new Error(
    `No compatible live RVC conversion endpoint was exposed. Candidates: ${JSON.stringify(
      entries.map(([name, endpoint]) => ({
        name,
        labels: (endpoint.parameters ?? []).map(labelFor),
      })),
    ).slice(0, 5000)}`,
  );
}

function valueFor(parameter) {
  const label = labelFor(parameter);
  if (label.includes("source audio"))
    return handle_file(new File([sourceBytes], "source-vocals.mp3", { type: "audio/mpeg" }));
  if (label.includes("model type")) return "RVC v2";
  if (label.includes("rvc model"))
    return handle_file(
      new File([modelBytes], "RedsVoiceSwap_53e_424s.pth", { type: "application/octet-stream" }),
    );
  if (label.includes("index file")) return null;
  if (label.includes("pitch")) return 0;
  if (label.includes("f0 method")) return "rmvpe";
  if (label.includes("index rate")) return 0;
  if (label.includes("protect")) return 0.33;
  if (label.includes("target speaker")) return 0;
  if (label.includes("formant shift")) return 0;
  if (parameter.parameter_has_default) return parameter.parameter_default;
  if (parameter.type === "boolean") return false;
  throw new Error(`Unsupported required RVC input: ${label}`);
}

function findAudioUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item);
      if (found) return found;
    }
    return null;
  }
  for (const key of ["url", "path"]) {
    if (typeof value[key] === "string" && /^https?:\/\//i.test(value[key])) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findAudioUrl(nested);
    if (found) return found;
  }
  return null;
}

function findStatusText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(findStatusText).filter(Boolean).join(" | ");
  return Object.values(value).map(findStatusText).filter(Boolean).join(" | ");
}

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
  if (bitsPerSample === 8) {
    for (let i = dataStart; i < end; i++) peak = Math.max(peak, Math.abs(bytes[i] - 128));
  } else if (bitsPerSample === 16) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = dataStart; i + 1 < end; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  } else if (bitsPerSample === 24) {
    for (let i = dataStart; i + 2 < end; i += 3) {
      let sample = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
      if (sample & 0x800000) sample |= 0xff000000;
      peak = Math.max(peak, Math.abs(sample));
    }
  } else {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = dataStart; i + 3 < end; i += 4) peak = Math.max(peak, Math.abs(view.getInt32(i, true)));
  }
  if (peak === 0) throw new Error("RVC produced a silent WAV; real voice conversion did not occur.");
  return { channels, bitsPerSample, dataBytes: dataLength, peak };
}

const app = await Client.connect(SPACE, { events: ["data", "status"] });
const api = await app.view_api();
const [endpointName, endpoint] = findEndpoint(api);
console.log(
  `Using live RVC endpoint: ${endpointName} on ${SPACE} with parameters: ${JSON.stringify(
    (endpoint.parameters ?? []).map((parameter) => parameter.label ?? parameter.parameter_name),
  )}`,
);

console.log("Downloading the real Red RVC model with gdown…");
modelPath = path.join(os.tmpdir(), "RedsVoiceSwap_53e_424s.pth");
try {
  execFileSync("python", ["-m", "gdown", MODEL_URL, "-O", modelPath], { stdio: "inherit", timeout: 180_000 });
} catch {
  execFileSync("python", ["-m", "pip", "install", "-q", "gdown"], { stdio: "inherit", timeout: 120_000 });
  execFileSync("python", ["-m", "gdown", MODEL_URL, "-O", modelPath], { stdio: "inherit", timeout: 180_000 });
}
const fs = await import("node:fs/promises");
const modelSize = Number((await fs.stat(modelPath)).size);
modelBytes = await fs.readFile(modelPath);
sourceBytes = await (await fetch(SOURCE_URL)).arrayBuffer();
if (!sourceBytes.byteLength) throw new Error("The source vocal download was empty.");
console.log(JSON.stringify({ modelPath, modelSize, sourceBytes: sourceBytes.byteLength }));

try {
  execFileSync("python", ["-c", "import torch"], { stdio: "ignore", timeout: 30_000 });
} catch {
  execFileSync("python", ["-m", "pip", "install", "-q", "torch", "--index-url", "https://download.pytorch.org/whl/cpu"], { stdio: "inherit", timeout: 240_000 });
}
const modelMeta = execFileSync(
  "python",
  [
    "-c",
    "import torch,sys; c=torch.load(sys.argv[1],map_location='cpu',weights_only=True); print({'keys':sorted(c.keys()),'config_len':len(c.get('config',[])),'version':c.get('version'),'f0':c.get('f0'),'sr':c.get('sr'),'speakers_id':c.get('speakers_id'),'vocoder':c.get('vocoder')})",
    modelPath,
  ],
  { encoding: "utf8", timeout: 120_000 },
).trim();
console.log("Red RVC checkpoint metadata:", modelMeta);
if (modelSize < 50_000_000) throw new Error(`The Red RVC model download is incomplete: ${modelSize} bytes.`);

const args = (endpoint.parameters ?? []).map(valueFor);
console.log("Submitting real source audio + RedsVoiceSwap model…");
let result = null;
try {
  const job = app.submit(endpointName, args);
  for await (const message of job) {
    if (message.type === "status") console.log("RVC status:", JSON.stringify(message));
    if (message.type === "data") result = message;
  }
} catch (error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  throw new Error(`RVC prediction failed at ${endpointName}: ${detail}`);
}
if (!result) throw new Error(`RVC returned no prediction data from ${endpointName}.`);

const audioUrl = findAudioUrl(result);
const statusText = findStatusText(result);
console.log("RVC result status:", statusText.slice(0, 2000));
if (!audioUrl) throw new Error(`RVC completed without returning a playable audio URL: ${JSON.stringify(result).slice(0, 2500)}`);

const response = await fetch(audioUrl);
if (!response.ok) throw new Error(`RVC output download failed: HTTP ${response.status}`);
const contentType = (response.headers.get("content-type") || "").toLowerCase();
const bytes = new Uint8Array(await response.arrayBuffer());
if (!contentType.startsWith("audio/")) throw new Error(`RVC output was not audio: ${contentType || "missing content-type"}`);
if (bytes.byteLength < MIN_AUDIO_BYTES) throw new Error(`RVC output was too small: ${bytes.byteLength} bytes`);
const wav = validateWav(bytes);
console.log(
  JSON.stringify({
    status: "ok",
    provider: SPACE,
    endpoint: endpointName,
    source: SOURCE_URL,
    model: "RedsVoiceSwap_53e_424s.pth",
    outputBytes: bytes.byteLength,
    contentType,
    wav,
  }),
);
