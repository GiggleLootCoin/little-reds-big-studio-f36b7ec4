import { Client, handle_file } from "@gradio/client";

const SPACE = "IAHispano/ApplioX";
const MODEL_URL = "https://drive.google.com/uc?id=19yLeLybGU8csalpLFuK6ORSS3aqaDkrW";
const SOURCE_URL =
  "https://raw.githubusercontent.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4/feat/studio-production-completion/13.7s%20Recording%20%28Jul%202%20%40%205_53%20PM%29.mp3";
const MIN_AUDIO_BYTES = 256;

const labelFor = (parameter) =>
  `${parameter.label ?? ""} ${parameter.parameter_name ?? ""}`.toLowerCase();

function findEndpoint(api) {
  const endpoints = Object.entries(api.named_endpoints ?? {}).filter(([name, endpoint]) => {
    const endpointName = name.toLowerCase();
    if (endpointName.includes("enforce_terms") || endpointName.includes("terms")) return false;
    const labels = (endpoint.parameters ?? []).map(labelFor);
    const returnsAudio = (endpoint.returns ?? []).some((output) =>
      String(output.component ?? "").toLowerCase().includes("audio"),
    );
    return (
      labels.some((label) => label.includes("select audio")) &&
      labels.some((label) => label.includes("voice model")) &&
      labels.some((label) => label.includes("index file")) &&
      returnsAudio
    );
  });
  if (!endpoints.length) throw new Error("No compatible named Applio RVC inference endpoint was exposed.");
  const preferred = endpoints.find(([name]) => /rvc|infer|convert|voice/.test(name.toLowerCase()));
  return preferred ?? endpoints[0];
}

function valueFor(parameter) {
  const label = labelFor(parameter);
  if (label.includes("voice model")) return handle_file(MODEL_URL);
  if (label.includes("index file")) return null;
  if (label.includes("select audio")) return handle_file(SOURCE_URL);
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

const app = await Client.connect(SPACE);
const api = await app.view_api();
const [endpointName, endpoint] = findEndpoint(api);
const args = (endpoint.parameters ?? []).map(valueFor);
console.log(`Using live Applio endpoint: ${endpointName}`);
console.log("Submitting real source audio + RedsVoiceSwap model…");

const job = app.submit(endpointName, args);
for await (const message of job) {
  if (message?.type === "status") {
    if (message.stage === "error") {
      throw new Error(
        `Applio RVC job failed at ${message.endpoint ?? endpointName}: ${
          message.original_msg || message.title || JSON.stringify(message)
        }`,
      );
    }
    if (message.stage === "error" || message.stage === "complete") console.log(JSON.stringify(message));
  }
}
const result = await job.result();
const audioUrl = findAudioUrl(result);
if (!audioUrl) throw new Error("Applio returned no playable audio URL.");

const response = await fetch(audioUrl);
if (!response.ok) throw new Error(`Applio output download failed: HTTP ${response.status}`);
const contentType = (response.headers.get("content-type") || "").toLowerCase();
const bytes = new Uint8Array(await response.arrayBuffer());
if (!contentType.startsWith("audio/"))
  throw new Error(`Applio output was not audio: ${contentType || "missing content-type"}`);
if (bytes.byteLength < MIN_AUDIO_BYTES)
  throw new Error(`Applio output was too small: ${bytes.byteLength} bytes`);

console.log(
  JSON.stringify({
    status: "ok",
    provider: "IAHispano/ApplioX",
    endpoint: endpointName,
    source: SOURCE_URL,
    model: "RedsVoiceSwap_53e_424s.pth",
    outputBytes: bytes.byteLength,
    contentType,
  }),
);
