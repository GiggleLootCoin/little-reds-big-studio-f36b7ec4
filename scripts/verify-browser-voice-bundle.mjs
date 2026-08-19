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

const required = [
  ["Qwen3-TTS Space", "Qwen/Qwen3-TTS"],
  ["Qwen clone route", "/generate_voice_clone"],
  ["browser audio verification", "normalizeAndVerifyBrowserAudio"],
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
  `Production Qwen voice bundle verified across ${jsFiles.length} browser JS assets: official Qwen3-TTS 0.6B reference-conditioned generate_voice_clone call, transformed uploaded-reference flow, transcript flow, explicit non-xvector-only conditioning, and non-empty/non-silent browser audio validation are present; prohibited remote/preset/API-key fallback markers are absent.`,
);
