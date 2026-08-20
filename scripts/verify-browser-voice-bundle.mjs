import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "dist", "client", "assets");
const forbidden = [
  "onnxruntime-node",
  "sharp",
  "rahul7star-chatterbox-multilingual-tts.hf.space",
  "spacekaren/chatterbox",
  "remote voice-clone fallback",
  "default voice fallback",
  "/api/ai/voice-clone",
];

const files = await readdir(root);
const jsFiles = files.filter((file) => file.endsWith(".js"));
if (jsFiles.length === 0) {
  throw new Error("Production browser bundle contains no JavaScript assets.");
}

const assets = await Promise.all(
  jsFiles.map(async (file) => [file, await readFile(join(root, file), "utf8")]),
);
const browserBundle = assets.map(([, source]) => source).join("\n");

const qwenMarker = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*[`\"']Qwen\/Qwen3-TTS[`\"']\s*,\s*([A-Za-z_$][\w$]*)\s*=\s*[`\"']0\.6B[`\"']/;
const qwenSource = assets
  .map(([file, source]) => ({ file, source }))
  .find(({ source }) => qwenMarker.test(source));
if (!qwenSource) {
  throw new Error("Production Qwen voice bundle is missing the official Qwen3-TTS/0.6B model binding.");
}

const modelMatch = qwenSource.source.match(qwenMarker);
if (!modelMatch) {
  throw new Error("Production Qwen voice bundle is missing the structured 0.6B model binding.");
}
const [, spaceBinding, modelBinding] = modelMatch;

const cloneCall = new RegExp(
  `(?:\\.predict\\(|predict\\()\\s*(?:\\x60|[\"'])\\/generate_voice_clone(?:\\x60|[\"'])\\s*,\\s*\\[\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*([A-Za-z_$][\\w$]*)\\.trim\\(\\)\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*,\\s*(?:\\x60|[\"'])English(?:\\x60|[\"'])\\s*,\\s*(?:false|!1)\\s*,\\s*${modelBinding}\\s*\\]`,
);
const cloneMatch = qwenSource.source.match(cloneCall);
if (!cloneMatch) {
  throw new Error(
    "Production Qwen voice bundle is missing the Buddy generate_voice_clone call with English → false → the bound 0.6B model argument.",
  );
}

const [, referenceBinding, transcriptBinding] = cloneMatch;
const referenceFlow = new RegExp(
  `(?:var|let|const)\\s+${referenceBinding}\\s*=\\s*await\\s+[A-Za-z_$][\\w$]*\\([^)]*\\)`,
);
if (!referenceFlow.test(qwenSource.source)) {
  throw new Error(
    "Production Qwen voice bundle is missing the transformed uploaded-reference binding feeding generate_voice_clone.",
  );
}

const transcriptFlow = new RegExp(
  `(?:var|let|const)\\s+${transcriptBinding}\\s*=|${transcriptBinding}\\.trim\\(\\)`,
);
if (!transcriptFlow.test(qwenSource.source)) {
  throw new Error("Production Qwen voice bundle is missing the reference transcript flow.");
}

const audioSafetySource = await readFile(
  join(process.cwd(), "src", "lib", "audio-artifact.ts"),
  "utf8",
);
const normalizeStart = audioSafetySource.indexOf(
  "export async function normalizeAndVerifyBrowserAudio(",
);
if (normalizeStart < 0) {
  throw new Error("Source browser audio verifier implementation is missing.");
}
const normalizeSource = audioSafetySource.slice(normalizeStart);

const audioSafetyMarkers = [
  "decodeAudioData",
  "decoded.duration",
  "decoded.numberOfChannels",
  "decoded.getChannelData",
  "0.25",
  "0.005",
  "0.0005",
  "Generated clone has no usable duration.",
  "Generated clone decoded successfully but is silent.",
  "new Audio()",
  "onloadedmetadata",
  "Android audio element did not load the generated clone.",
  "Android audio element reported no usable duration.",
  "Android audio element could not decode the generated clone.",
];
for (const marker of audioSafetyMarkers) {
  if (!normalizeSource.includes(marker)) {
    throw new Error(`Source browser audio verifier is missing required safety construct: ${marker}`);
  }
}

const audioSafetyAsset = qwenSource.source;
const orderedBundleMarkers = [
  "decodeAudioData",
  "Generated clone has no usable duration.",
  "Generated clone decoded successfully but is silent.",
  "new Audio",
  "onloadedmetadata",
  "Android audio element did not load the generated clone.",
  "Android audio element reported no usable duration.",
  "Android audio element could not decode the generated clone.",
];
let previousIndex = -1;
for (const marker of orderedBundleMarkers) {
  const index = audioSafetyAsset.indexOf(marker);
  if (index < 0) {
    throw new Error(`Production Qwen voice bundle is missing browser audio-safety construct: ${marker}`);
  }
  if (index <= previousIndex) {
    throw new Error(
      "Production Qwen voice bundle does not preserve the required browser audio-safety operation order.",
    );
  }
  previousIndex = index;
}

const thresholdPositions = ["0.25", "0.005", "0.0005"].map((marker) =>
  audioSafetyAsset.indexOf(marker),
);
if (thresholdPositions.some((index) => index < 0)) {
  throw new Error(
    "Production Qwen voice bundle is missing one or more source-defined duration/peak/RMS safety thresholds.",
  );
}

const required = [
  ["Qwen3-TTS Space", "Qwen/Qwen3-TTS"],
  ["Qwen clone route", "/generate_voice_clone"],
];
for (const [label, needle] of required) {
  if (!browserBundle.includes(needle)) {
    throw new Error(`Production Qwen voice bundle is missing required marker: ${label}`);
  }
}

const requiredRejections = [
  "Qwen returned an empty audio file.",
  "Qwen returned an empty waveform.",
  "Qwen returned an empty audio artifact.",
  "Qwen returned no playable cloned audio.",
  "Qwen3-TTS returned silent or unusable audio.",
];
for (const marker of requiredRejections) {
  if (!browserBundle.includes(marker)) {
    throw new Error(`Production Qwen voice bundle is missing required rejection: ${marker}`);
  }
}

for (const needle of forbidden) {
  if (browserBundle.includes(needle)) {
    throw new Error(`Production browser voice bundle contains forbidden marker: ${needle}`);
  }
}

console.log(
  `Production Qwen voice bundle verified across ${jsFiles.length} browser JS assets: official Qwen3-TTS 0.6B reference-conditioned generate_voice_clone call, transformed uploaded-reference flow, transcript flow, source-defined browser decode/duration/peak/RMS safety path, Android audio-element validation, and non-empty/non-silent browser audio validation are present; prohibited remote/preset/API-key fallback markers are absent.`,
);
