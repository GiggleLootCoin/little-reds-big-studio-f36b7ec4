import { saveBuddyClonePreview } from "./buddy-voice";

export type CloneResult = { url: string; provider: string; verification: string };

const ENDPOINT = "/api/ai/voice-clone";

function extensionForMime(mime: string): string {
  const value = mime.toLowerCase().split(";")[0];
  const map: Record<string, string> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/webm": "webm",
    "audio/flac": "flac",
    "audio/amr": "amr",
    "audio/3gpp": "3gp",
  };
  return map[value] || "bin";
}

function providerFromHeaders(response: Response): string {
  return (
    response.headers.get("x-clone-provider") ||
    response.headers.get("x-buddy-clone-backend") ||
    "Hugging Face Chatterbox"
  );
}

async function cloneWithProductionGateway(
  sample: Blob,
  refText: string,
  text: string,
  language: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  if (!sample.size) throw new Error("The voice sample is empty.");

  const mime = sample.type || "audio/wav";
  const filename = `voice-reference.${extensionForMime(mime)}`;
  const file = new File([sample], filename, { type: mime });
  const form = new FormData();
  form.append("audio", file, filename);
  form.append("text", text.trim());
  form.append("target_text", text.trim());
  form.append("refText", refText.trim());
  form.append("referenceTranscript", refText.trim());
  form.append("language", language || "English");

  onStatus?.("Uploading your actual voice sample to Buddy's Chatterbox clone gateway…");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    body: form,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    let detail = `Voice clone request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail += ` ${payload.error}`;
    } catch {
      const textBody = await response.text().catch(() => "");
      if (textBody) detail += ` ${textBody.slice(0, 500)}`;
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("audio/"))
    throw new Error(`Voice clone returned ${contentType || "unknown content"} instead of audio.`);

  const artifact = await response.blob();
  if (artifact.size < 4096)
    throw new Error("Voice clone returned an empty or unusably small audio artifact.");

  const url = URL.createObjectURL(artifact);
  const provider = providerFromHeaders(response);
  const verification =
    response.headers.get("x-clone-verified") === "true"
      ? "gateway audio artifact verified"
      : "gateway audio artifact returned";
  await saveBuddyClonePreview(artifact, provider);
  onStatus?.("Chatterbox returned a playable audio artifact from your uploaded reference voice.");
  return { url, provider, verification };
}

export async function createBestFreeVoiceClone(
  sample: Blob,
  refText: string,
  text: string,
  onStatus?: (s: string) => void,
): Promise<CloneResult> {
  return cloneWithProductionGateway(sample, refText, text, "English", onStatus);
}
