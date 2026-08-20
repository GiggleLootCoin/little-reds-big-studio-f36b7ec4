import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "dist", "client", "assets");
const files = await readdir(root);
const jsFiles = files.filter((file) => file.endsWith(".js"));
if (!jsFiles.length) {
  throw new Error("No production browser JavaScript assets were found.");
}

const assets = await Promise.all(
  jsFiles.map(async (file) => [file, await readFile(join(root, file), "utf8")]),
);

const qwenPathMarkers = [
  "/api/voice-clone",
  "Qwen3-TTS 0.6B Base",
  "audioBase64",
  "refText",
  "response.blob()",
  "normalizeAndVerifyBrowserAudio",
];

const qwenPathAssets = assets.filter(([, source]) =>
  qwenPathMarkers.every((marker) => source.includes(marker)),
);
if (qwenPathAssets.length !== 1) {
  throw new Error(
    `Expected exactly one production browser asset containing the complete Qwen voice-clone path, found ${qwenPathAssets.length}.`,
  );
}

const [qwenAssetName, qwenAsset] = qwenPathAssets[0];
if (qwenAsset.includes("createLocalChatterboxClone")) {
  throw new Error(
    "Production browser voice-clone asset still contains the obsolete createLocalChatterboxClone path.",
  );
}

const obsoleteChatterboxWorker = files.filter(
  (file) => file.startsWith("chatterbox-local.worker-") && file.endsWith(".js"),
);
if (obsoleteChatterboxWorker.length) {
  throw new Error(
    `Production browser bundle contains obsolete Chatterbox voice worker asset(s): ${obsoleteChatterboxWorker.join(", ")}`,
  );
}

for (const [file, source] of assets) {
  if (source.includes("createLocalChatterboxClone")) {
    throw new Error(
      `Production browser bundle contains obsolete createLocalChatterboxClone path in ${file}.`,
    );
  }
}

console.log(`Production Qwen voice path verified in browser asset: ${qwenAssetName}`);
console.log(
  "Actual reference audio/transcript → /api/voice-clone → Qwen3-TTS 0.6B → returned Blob → normalizeAndVerifyBrowserAudio() is present in one production browser asset; obsolete local Chatterbox voice-clone worker/path is absent.",
);
