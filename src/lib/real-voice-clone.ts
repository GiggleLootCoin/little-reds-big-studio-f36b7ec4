export type RealCloneResult = {
  url: string;
  provider: string;
  voiceId?: string;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read the voice recording."));
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(blob);
  });
}

async function jsonRequest(path: string, body: Record<string, unknown>): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response;
}

async function audioResponse(response: Response, provider: string): Promise<RealCloneResult> {
  if (!response.ok) {
    let message = `${provider} returned HTTP ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error(`${provider} returned empty audio.`);
  return {
    url: URL.createObjectURL(blob),
    provider,
    voiceId: response.headers.get("x-voice-id") || undefined,
  };
}

export async function createRealVoiceClone(
  reference: Blob,
  text: string,
  language = "English",
): Promise<RealCloneResult> {
  if (reference.size === 0) throw new Error("The voice recording is empty.");
  const audioBase64 = await blobToBase64(reference);
  const response = await jsonRequest("/api/ai/voice-clone", {
    audioBase64,
    text,
    language,
  });
  return audioResponse(response, "Custom Voice Clone");
}

export async function speakWithRealVoiceClone(
  voiceId: string,
  text: string,
  language = "English",
): Promise<RealCloneResult> {
  if (!voiceId) throw new Error("The verified custom voice ID is missing.");
  const response = await jsonRequest("/api/ai/tts", {
    text,
    language,
    voiceId,
  });
  return audioResponse(response, "Custom Voice Clone");
}
