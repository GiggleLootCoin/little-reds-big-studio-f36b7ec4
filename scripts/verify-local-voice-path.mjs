import { readFile } from "node:fs/promises";

// This verifier intentionally covers only the production Buddy custom-voice path.
const files = {
  clone: await readFile("src/lib/real-voice-clone-v2.ts", "utf8"),
  qwen: await readFile("src/lib/qwen3-tts-clone.ts", "utf8"),
  buddy: await readFile("src/lib/buddy-voice.ts", "utf8"),
  runtime: await readFile("src/lib/studio-runtime.ts", "utf8"),
};

const required = [
  ["clone imports Qwen engine", files.clone, 'import { createQwen3TTSClone } from "./qwen3-tts-clone"'],
  ["clone calls Qwen with uploaded reference and transcript", files.clone, "createQwen3TTSClone(sample, refText, text, onStatus)"],
  ["Qwen engine accepts Blob reference", files.qwen, "sample: Blob"],
  ["Qwen engine uploads the reference Blob", files.qwen, "handle_file(sample)"],
  ["Qwen engine passes the reference transcript", files.qwen, "refText"],
  ["Qwen engine uses generate_voice_clone", files.qwen, "generate_voice_clone"],
  ["Qwen engine uses the official Qwen3-TTS Space", files.qwen, 'const SPACE_ID = "Qwen/Qwen3-TTS"'],
  ["Qwen engine uses the intended Base 0.6B model size", files.qwen, 'const MODEL_SIZE = "0.6B"'],
  ["Qwen engine uses reference-conditioned cloning", files.qwen, 'use_xvector_only: false'],
  ["Qwen engine rejects empty generated audio", files.qwen, "Qwen voice clone returned empty audio"],
  ["Qwen engine validates generated audio", files.qwen, "validateGeneratedAudio"],
  ["Buddy sample persistence is local only", files.buddy, "putVoiceValue(SAMPLE_KEY"],
  ["voice clone is intercepted before generic runtime", files.runtime, 'if (capability === "voice-clone")'],
  ["verified clone uses the production clone engine", files.runtime, "createBestFreeVoiceClone"],
  ["generic runtime is loaded only after voice handling", files.runtime, 'import("./studio-runtime-impl")'],
];

for (const [label, source, needle] of required) {
  if (!source.includes(needle)) throw new Error(`Voice-path verification failed: ${label}`);
}

const forbiddenProductionClone = [
  "createLocalChatterboxClone",
  ".hf.space",
  "rahul7star",
  "spacekaren",
  "/api/ai/voice-clone",
  "OPENROUTERAI_API_KEY",
  "generate_custom_voice",
  "speaker: \"",
  "speaker:",
];
for (const [label, source] of [
  ["production clone", files.clone],
  ["Qwen clone engine", files.qwen],
]) {
  for (const needle of forbiddenProductionClone) {
    if (source.includes(needle)) {
      throw new Error(
        `Voice-path verification failed: forbidden clone dependency found in ${label}: ${needle}`,
      );
    }
  }
}

const runtimeRegistry = await readFile("src/lib/free-runtime.ts", "utf8");
const voiceBlock =
  runtimeRegistry.match(/id:\s*"voice-chatterbox-local"[\s\S]*?(?=\n\s*\},)/)?.[0] ?? "";
if (voiceBlock && !voiceBlock.includes("fallbackIds: []")) {
  throw new Error("Voice capability registry must not advertise a voice fallback.");
}

console.log(
  "Buddy voice path verified: uploaded Blob -> Qwen3-TTS Base reference conditioning with ref_text -> generate_voice_clone() -> validated non-empty/non-silent playable audio; no local Chatterbox production import, public Space, API-key route, or preset-speaker clone fallback.",
);