import type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
import { getBuddyVoiceProfile, getBuddyVoiceSample, markBuddyCloneVerified } from "./buddy-voice";
import { saveVoiceSample } from "./voice-profile";
import { normalizeAndVerifyBrowserAudio } from "./audio-artifact";
import { saveBuddyClonePreview } from "./buddy-voice";
import { createBestFreeVoiceClone } from "./real-voice-clone-v2";
import { buildBuddyMemoryContext, rememberUserMessage } from "./buddy-memory.mjs";

export type { StudioArtifact, StudioCapability, StudioJobInput } from "./studio-runtime-impl";
export { runtimeProviders } from "./studio-runtime-impl";

const DEFAULT_CLONE_TEXT =
  "Hello. This is your cloned voice sample. Would you like to use this voice for Buddy now, or would you like to record again?";
let cachedRedReferenceId = "";
let cachedRedReferenceBase64 = "";

const KOKORO_PRESET_SPEAKERS: Record<string, string> = {
  Red: "af_bella",
  Ryan: "af_nicole",
  Aiden: "af_sarah",
  Vivian: "af_sky",
  Serena: "am_adam",
  Uncle_Fu: "am_michael",
  Dylan: "bf_emma",
  Eric: "bf_isabella",
  Ono_Anna: "bm_george",
  Sohee: "bm_lewis",
  amalthea: "af_alloy",
  andromeda: "af_aoede",
  apollo: "af_jessica",
  arcas: "af_kore",
  aries: "af_nova",
  asteria: "af_river",
  athena: "am_echo",
  atlas: "am_eric",
  aurora: "am_fenrir",
  callista: "am_liam",
  cora: "am_onyx",
  cordelia: "am_puck",
  delia: "am_santa",
  draco: "bf_alice",
  electra: "bf_lily",
  harmonia: "bm_daniel",
  helena: "bm_fable",
  hera: "ef_dora",
  hermes: "em_alex",
  hyperion: "em_santa",
  iris: "ff_siwis",
  janus: "hf_alpha",
  juno: "hf_beta",
  jupiter: "hm_omega",
  luna: "hm_psi",
  mars: "if_sara",
  minerva: "im_nicola",
  neptune: "jf_alpha",
  odysseus: "jf_gongitsune",
  ophelia: "jf_nezumi",
  orion: "jf_tebukuro",
  orpheus: "jm_kumo",
  pandora: "pf_dora",
  phoebe: "pm_alex",
  pluto: "pm_santa",
  saturn: "zf_xiaobei",
  selene: "zf_xiaoni",
  thalia: "zf_xiaoxiao",
  theia: "zf_xiaoyi",
  vesta: "zm_yunjian",
  zeus: "zm_yunxi",
};

function kokoroPresetSpeaker(value: string): string {
  return KOKORO_PRESET_SPEAKERS[value] || value;
}

export function artifactText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(artifactText).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    for (const key of [
      "text",
      "response",
      "generated_text",
      "transcription",
      "transcript",
      "content",
      "value",
      "data",
      "output",
      "result",
    ]) {
      const found = artifactText((value as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return "";
}
function cloneProfile() {
  return getBuddyVoiceProfile();
}
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}
async function redReferenceId(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function runProductionRedClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
) {
  onStatus?.("Generating Buddy's Red voice…");
  const referenceId = await redReferenceId(sample);
  const alreadyEncoded =
    cachedRedReferenceId === referenceId && cachedRedReferenceBase64.length > 0;
  if (!alreadyEncoded) {
    cachedRedReferenceBase64 = await blobToBase64(sample);
    cachedRedReferenceId = referenceId;
  }
  const makeBody = () => ({
    referenceId,
    audioBase64: cachedRedReferenceBase64,
    audioType: sample.type || "audio/wav",
    text: text.trim().slice(0, 220),
    language,
    refText: refText.trim(),
    modelSize,
  });
  let response = await fetch("/api/ai/voice-clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(makeBody()),
  });
  if (response.status === 428) {
    onStatus?.("Refreshing Buddy's voice reference…");
    cachedRedReferenceBase64 = await blobToBase64(sample);
    cachedRedReferenceId = referenceId;
    response = await fetch("/api/ai/voice-clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeBody()),
    });
  }
  if (!response.ok) {
    console.error("Red voice generation failed", response.status, await response.text().catch(() => ""));
    throw new Error("Buddy's Red voice could not be generated.");
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("Buddy's Red voice returned empty audio.");
  const normalized = await normalizeAndVerifyBrowserAudio(blob);
  if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
    throw new Error("Buddy's Red voice returned silent or unusable audio.");
  return {
    url: normalized.url,
    provider: response.headers.get("x-clone-provider") || "Production Red reference clone",
    verification: "Production Red reference clone + browser audio decode + non-silent verification",
    duration: normalized.stats.duration,
    peak: normalized.stats.peak,
    rms: normalized.stats.rms,
  };
}
async function runVerifiedClone(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
  modelSize: "0.6B" | "1.7B" = "1.7B",
  persist = true,
  speaker?: string,
) {
  if (speaker === "Red" || cloneProfile().speaker === "Red") {
    const result = await runProductionRedClone(sample, refText, text, language, onStatus, modelSize);
    if (persist) {
      await saveVoiceSample(sample, refText);
      await markBuddyCloneVerified("Verified creator voice clone");
      await saveBuddyClonePreview(sample, "Verified creator voice clone");
    }
    return result;
  }
  let result;
  try {
    result = await createBestFreeVoiceClone(sample, refText, text, language, onStatus, modelSize, persist);
  } catch (primaryError) {
    onStatus?.("Trying another free voice route…");
    try {
      const runtime = await import("./studio-runtime-impl");
      const fallback = await runtime.runStudioJob(
        "voice-clone",
        {
          refAudio: sample,
          referenceAudio: sample,
          audio: sample,
          refText,
          referenceTranscript: refText,
          target_text: text,
          text,
          language,
          _skipProviders: ["hf-qwen3-tts"],
        },
        onStatus,
      );
      if (!fallback.url) throw primaryError;
      const fallbackBlob = await fetch(fallback.url).then((response) => {
        if (!response.ok) throw new Error("Fallback audio download failed.");
        return response.blob();
      });
      const normalized = await normalizeAndVerifyBrowserAudio(fallbackBlob);
      if (normalized.stats.duration <= 0 || normalized.stats.peak <= 0 || normalized.stats.rms <= 0)
        throw new Error("Fallback clone returned silent or unusable audio.");
      if (persist) await saveBuddyClonePreview(normalized.blob, "Verified creator voice clone");
      result = {
        url: normalized.url,
        provider: fallback.provider,
        verification: "Free fallback + browser audio decode + non-silent artifact verification",
        duration: normalized.stats.duration,
        peak: normalized.stats.peak,
        rms: normalized.stats.rms,
      };
    } catch (fallbackError) {
      console.error("Voice clone failed", primaryError, fallbackError);
      throw new Error("Buddy's voice clone could not be generated.");
    }
  }
  if (!result.url) throw new Error("The voice engine returned no playable audio.");
  if (persist) {
    await saveVoiceSample(sample, refText);
    await markBuddyCloneVerified("Verified creator voice clone");
  }
  return result;
}
async function prepareSpeechToText(input: StudioJobInput): Promise<StudioJobInput> {
  const audio = input.audio;
  if (!(audio instanceof Blob)) return input;
  try {
    return { ...input, audio: (await normalizeAndVerifyBrowserAudio(audio)).blob };
  } catch (error) {
    throw new Error(
      `The microphone recording could not be decoded. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export async function runStudioJob(
  capability: StudioCapability,
  input: StudioJobInput,
  onStatus?: (s: string) => void,
): Promise<StudioArtifact> {
  if (capability === "voice-clone") {
    const sample = input.refAudio ?? input.referenceAudio ?? input.audio;
    if (!(sample instanceof Blob)) {
      const speaker = String(input.speaker ?? "").trim();
      if (speaker && speaker !== "Red") {
        const runtime = await import("./studio-runtime-impl");
        const presetInput = {
          ...input,
          text: String(input.text ?? input.target_text ?? input.prompt ?? DEFAULT_CLONE_TEXT).trim(),
          speaker: kokoroPresetSpeaker(speaker),
        };
        try {
          return await runtime.runStudioJob("tts", presetInput, onStatus);
        } catch (error) {
          console.error("Preset voice generation failed", error);
          throw new Error("The selected voice could not be generated.");
        }
      }
      throw new Error("A verified voice recording is required for a real clone.");
    }
    const refText = String(
      input.refText ?? input.referenceText ?? input.referenceTranscript ?? cloneProfile().referenceTranscript ?? "",
    ).trim();
    const targetText = String(input.target_text ?? input.text ?? input.prompt ?? DEFAULT_CLONE_TEXT).trim() || DEFAULT_CLONE_TEXT;
    const language = String(input.language ?? cloneProfile().language ?? "English");
    const modelSize = input.model_size === "0.6B" ? "0.6B" : "1.7B";
    onStatus?.("Using Buddy's verified voice mode…");
    const result = await runVerifiedClone(sample, refText, targetText, language, onStatus, modelSize, true);
    return { capability, value: result, url: result.url, provider: result.provider };
  }
  if (capability === "tts") {
    const profile = cloneProfile();
    const text = String(input.text ?? input.target_text ?? input.prompt ?? "").trim();
    if (!text) throw new Error("Voice text is empty.");
    const language = String(input.language ?? profile.language ?? "English");
    const modelSize = input.model_size === "0.6B" ? "0.6B" : "1.7B";
    const wantsRedVoice = profile.mode === "clone" || profile.speaker === "Red" || input.speaker === "Red";
    if (wantsRedVoice) {
      const savedSample = await getBuddyVoiceSample();
      const effectiveSpeaker = typeof input.speaker === "string" ? input.speaker : profile.speaker;
      if (!savedSample) {
        throw new Error("Your verified Red voice is not loaded. Upload or record your verified voice sample first.");
      }
      const refText = profile.referenceTranscript?.trim() || "";
      onStatus?.("Speaking in your verified Red voice…");
      const result = await runVerifiedClone(savedSample, refText, text, language, onStatus, modelSize, false, effectiveSpeaker);
      return { capability: "tts", value: result, url: result.url, provider: result.provider };
    }
  }
  let preparedInput = capability === "speech-to-text" ? await prepareSpeechToText(input) : input;
  if (capability === "tts") {
    preparedInput = { ...preparedInput, speaker: kokoroPresetSpeaker(String(preparedInput.speaker ?? profileSpeakerFallback())) };
  }
  if (capability === "chat") {
    const prompt = String(preparedInput.prompt ?? preparedInput.text ?? "").trim();
    if (prompt) rememberUserMessage(prompt);
    const memory = buildBuddyMemoryContext();
    if (memory) {
      const existing = Array.isArray(preparedInput.messages) ? preparedInput.messages : [];
      const systemIndex = existing.findIndex((message) => message && typeof message === "object" && (message as Record<string, unknown>).role === "system");
      const messages = [...existing];
      if (systemIndex >= 0) {
        const current = messages[systemIndex] as Record<string, unknown>;
        messages[systemIndex] = { ...current, content: `${String(current.content ?? "").trim()}\n\n${memory}`.trim() };
      } else {
        messages.unshift({ role: "system", content: memory });
      }
      preparedInput = { ...preparedInput, messages, history: messages };
    }
  }
  const mod = await import("./studio-runtime-impl");
  try {
    return await mod.runStudioJob(capability, preparedInput, capability === "tts" ? (message) => onStatus?.(message.replace(/^Working with .*…$/, "Generating your selected voice…")) : onStatus);
  } catch (error) {
    if (capability === "tts") {
      console.error("Preset TTS failed", error);
      throw new Error("The selected voice could not be generated.");
    }
    throw error;
  }
}

function profileSpeakerFallback(): string {
  return getBuddyVoiceProfile().speaker || "Ryan";
}
