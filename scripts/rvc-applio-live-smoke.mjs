import { Client, handle_file } from "@gradio/client";

const SPACE = "IAHispano/ApplioX";
const MODEL_URL = "https://drive.google.com/uc?id=19yLeLybGU8csalpLFuK6ORSS3aqaDkrW";
const SOURCE_URL =
  "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/feat/studio-production-completion/13.7s%20Recording%20%28Jul%202%20%40%205_53%20PM%29.mp3";
const MIN_AUDIO_BYTES = 256;

const labelFor = (parameter) =>
  `${parameter.label ?? ""} ${parameter.parameter_name ?? ""}`.toLowerCase();

function hasInferenceInputs(endpoint) {
  const labels = (endpoint.parameters ?? []).map(labelFor);
  return (
    labels.some((label) => label.includes("voice model")) &&
    labels.some((label) => label.includes("index file")) &&
    labels.some(
      (label) =>
        label.includes("select audio") || label.includes("input audio") || label.includes("audio input"),
    )
  );
}

function findEndpoint(api) {
  const named = Object.entries(api.named_endpoints ?? {});
  const unnamed = Object.entries(api.unnamed_endpoints ?? {});
  const entries = [...named, ...unnamed];
  const nonTerms = entries.filter(([name]) => !name.toLowerCase().includes("terms"));
  const preferred = nonTerms.find(([name, endpoint]) =>
    /rvc|infer|convert|voice/.test(name.toLowerCase()) && hasInferenceInputs(endpoint),
  );
  if (preferred) return preferred;
  const heuristic = nonTerms.find(([, endpoint]) => hasInferenceInputs(endpoint));
  if (heuristic) return heuristic;
  const termsFallback = entries.find(([name, endpoint]) =>
    name.toLowerCase().includes("terms") && hasInferenceInputs(endpoint),
  );
  if (termsFallback) return termsFallback;
  const diagnostic = entries
    .map(([name, endpoint]) => ({ name, labels: (endpoint.parameters ?? []).map(labelFor) }))
    .filter(({ labels }) => labels.some((label) => label.includes("voice model")));
  throw new Error(`No compatible named or unnamed Applio RVC inference endpoint was exposed. Candidates: ${JSON.stringify(diagnostic).slice(0, 3000)}`);
}

function valueFor(parameter) {
  const label = labelFor(parameter);
  if (label.includes("voice model")) return handle_file(MODEL_URL);
  if (label.includes("index file")) return null;
  if (
    label.includes("select audio") ||
    label.includes("input audio") ||
    label.includes("audio input")
  ) {
    return handle_file(SOURCE_URL);
  }
  if (label.includes("agree to the terms")) return true;
  if (label.includes("output path")) return "assets/audios/ci-red-rvc-output.wav";
  if (label.includes("export format")) return "WAV";
  if (label.includes("speaker id")) return 0;
  if (label.includes("pitch extraction")) return "rmvpe";
  if (label.includes("search feature ratio")) return 0.75;
  if (label.includes("protect voiceless")) return 0.5;
  if (label === "pitch" || label.endsWith(" pitch")) return 0;
  if (label.includes("autotune")) return false;
  if (label.includes("embedder model")) return "contentvec";
  if (label.includes("custom embedder")) return null;
  if (parameter.parameter_has_default) return parameter.parameter_default;
  const booleans = [
    "split audio",
    "proposed pitch",
    "clean audio",
    "formant shifting",
    "post-process",
    "reverb",
    "pitch shift",
    "limiter",
    "gain",
    "distortion",
    "chorus",
    "bitcrush",
    "clipping",
    "compressor",
    "delay",
  ];
  if (booleans.some((name) => label.includes(name))) return false;
  throw new Error(`Unsupported required Applio input: ${label}`);
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

function readAscii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function validateWav(bytes) {
  if (bytes.byteLength < 44 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    throw new Error("Applio output is not a valid RIFF/WAVE file.");
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
    if (chunkStart + size > bytes.byteLength) throw new Error("Applio WAV contains a truncated chunk.");
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
    throw new Error("Applio WAV is missing supported PCM audio metadata.");
  }
  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error(`Applio WAV uses unsupported PCM depth: ${bitsPerSample} bits.`);
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
  if (peak === 0) throw new Error("Applio produced a silent WAV; real voice conversion did not occur.");
  return { channels, bitsPerSample, dataBytes: dataLength, peak };
}

const app = await Client.connect(SPACE, { events: ["data", "status"] });
const api = await app.view_api({ all_endpoints: true });
const [endpointName, endpoint] = findEndpoint(api);
const args = (endpoint.parameters ?? []).map(valueFor);
console.log(`Using live Applio endpoint: ${endpointName}`);
console.log("Submitting real source audio + RedsVoiceSwap model…");

let result;
try {
  result = await app.predict(endpointName, args);
} catch (error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  throw new Error(`Applio RVC prediction failed at ${endpointName}: ${detail}`);
}

const audioUrl = findAudioUrl(result);
if (!audioUrl) throw new Error(`Applio completed without returning a playable audio URL: ${JSON.stringify(result).slice(0, 1500)}`);

const response = await fetch(audioUrl);
if (!response.ok) throw new Error(`Applio output download failed: HTTP ${response.status}`);
const contentType = (response.headers.get("content-type") || "").toLowerCase();
const bytes = new Uint8Array(await response.arrayBuffer());
if (!contentType.startsWith("audio/"))
  throw new Error(`Applio output was not audio: ${contentType || "missing content-type"}`);
if (bytes.byteLength < MIN_AUDIO_BYTES)
  throw new Error(`Applio output was too small: ${bytes.byteLength} bytes`);
const wav = validateWav(bytes);

console.log(
  JSON.stringify({
    status: "ok",
    provider: "IAHispano/ApplioX",
    endpoint: endpointName,
    source: SOURCE_URL,
    model: "RedsVoiceSwap_53e_424s.pth",
    outputBytes: bytes.byteLength,
    contentType,
    wav,
  }),
);
