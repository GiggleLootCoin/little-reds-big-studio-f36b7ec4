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

const diagnosticMarkers = [
  "/generate_voice_clone",
  "handle_file",
  "refText",
  '"English"',
  "false",
  "0.6B",
  "MODEL_SIZE",
];
const contextRadius = 360;
for (const marker of diagnosticMarkers) {
  let reported = 0;
  for (const [file, source] of assets) {
    let fromIndex = 0;
    while (reported < 12) {
      const index = source.indexOf(marker, fromIndex);
      if (index === -1) break;
      const start = Math.max(0, index - contextRadius);
      const end = Math.min(source.length, index + marker.length + contextRadius);
      console.log(
        `[browser-voice-diagnostic] ${marker} in ${file}: ${JSON.stringify(source.slice(start, end))}`,
      );
      reported += 1;
      fromIndex = index + marker.length;
    }
    if (reported >= 12) break;
  }
  if (reported === 0) {
    console.log(`[browser-voice-diagnostic] ${marker}: NOT FOUND`);
  }
}

const required = [
  ["Qwen3-TTS Space", 'Qwen/Qwen3-TTS'],
  ["Qwen model size", /(?:MODEL_SIZE\s*=\s*)?["']0\.6B["']/],
  ["Qwen clone route", "/generate_voice_clone"],
  ["reference upload", "handle_file(sample)"],
  ["reference transcript", "refText"],
  ["browser audio verification", "normalizeAndVerifyBrowserAudio"],
];
for (const [label, needle] of required) {
  const found = needle instanceof RegExp ? needle.test(browserBundle) : browserBundle.includes(needle);
  if (!found) {
    throw new Error(`Production Qwen voice bundle is missing required marker: ${label}`);
  }
}

if (
  !browserBundle.match(
    /["']English["']\s*,\s*(?:false|!1)\s*,\s*(?:MODEL_SIZE\b|["']0\.6B["'])/,
  )
) {
  throw new Error(
    "Production Qwen voice bundle is missing the explicit false use_xvector_only argument followed by the 0.6B model size.",
  );
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
  `Production Qwen voice bundle verified across ${jsFiles.length} browser JS assets: official Qwen3-TTS 0.6B reference conditioning, generate_voice_clone(), reference transcript/audio upload, explicit non-xvector-only conditioning, and non-empty/non-silent browser audio validation are present; prohibited remote/preset/API-key fallback markers are absent.`,
);
