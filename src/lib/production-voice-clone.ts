const BACKEND = "huggingface-fal-chatterbox";
const VERSION = "voice-clone-v5.0";
const ROUTE = "https://router.huggingface.co/fal-ai/fal-ai/chatterbox/text-to-speech";
const DEFAULT_TEXT =
  "Hi. I'm Buddy. This is my new voice. Let's make something brilliant together.";

type CloneEnv = { HF_TOKEN?: string };

type CloneBody = {
  audioBase64?: string;
  audio?: string;
  refAudio?: string;
  referenceAudio?: string;
  audioMimeType?: string;
  text?: string;
  target_text?: string;
  prompt?: string;
};

function headers(): Headers {
  const value = new Headers({ "cache-control": "no-store, no-cache, must-revalidate" });
  value.set("x-buddy-clone-backend", BACKEND);
  value.set("x-buddy-clone-version", VERSION);
  return value;
}

function decodeAudio(value: string): { bytes: Uint8Array; mime: string } {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  const mime = match?.[1] || "audio/wav";
  const raw = (match?.[2] || value).replace(/\s/g, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

function toDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return `data:${mime || "audio/wav"};base64,${btoa(binary)}`;
}

function audioResponse(bytes: Uint8Array, contentType: string): Response {
  if (bytes.byteLength < 4096)
    throw new Error("The voice service returned an empty or unusably small audio file.");
  const type = contentType.toLowerCase();
  const wav =
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WAVE";
  if (!type.startsWith("audio/") && !wav)
    throw new Error("The voice service returned non-audio data; clone was not marked ready.");
  const responseHeaders = headers();
  responseHeaders.set("content-type", type.startsWith("audio/") ? contentType : "audio/wav");
  responseHeaders.set("content-length", String(bytes.byteLength));
  responseHeaders.set("x-clone-provider", "Chatterbox via Hugging Face Inference Providers");
  responseHeaders.set("x-clone-verified", "true");
  return new Response(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    { status: 200, headers: responseHeaders },
  );
}

export function voiceCloneHealth(): Response {
  return Response.json(
    {
      ok: true,
      capability: "voice-clone",
      backend: BACKEND,
      version: VERSION,
      transcriptRequired: false,
    },
    { headers: headers() },
  );
}

export async function handleProductionVoiceClone(
  request: Request,
  env: CloneEnv,
): Promise<Response> {
  if (request.method !== "POST")
    return Response.json(
      { ok: false, error: "POST required." },
      { status: 405, headers: headers() },
    );
  if (!env.HF_TOKEN)
    return Response.json(
      {
        ok: false,
        backend: BACKEND,
        version: VERSION,
        error: "Hugging Face voice service is not configured.",
      },
      { status: 503, headers: headers() },
    );

  let body: CloneBody;
  try {
    body = (await request.json()) as CloneBody;
  } catch {
    return Response.json(
      { ok: false, error: "The clone request was not valid JSON." },
      { status: 400, headers: headers() },
    );
  }

  const encoded = body.audioBase64 || body.audio || body.refAudio || body.referenceAudio;
  if (!encoded)
    return Response.json(
      { ok: false, error: "A voice sample is required." },
      { status: 400, headers: headers() },
    );

  try {
    const decoded = decodeAudio(encoded);
    if (decoded.bytes.byteLength < 4096) throw new Error("The voice sample is too short or empty.");
    const text =
      body.text?.trim() || body.target_text?.trim() || body.prompt?.trim() || DEFAULT_TEXT;
    const upstream = await fetch(ROUTE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        audio_url: toDataUri(decoded.bytes, body.audioMimeType || decoded.mime),
        exaggeration: 0.5,
        temperature: 0.8,
        cfg: 0.5,
        seed: 0,
      }),
    });

    const type = upstream.headers.get("content-type") || "";
    const raw = new Uint8Array(await upstream.arrayBuffer());
    if (!upstream.ok) {
      const detail = new TextDecoder().decode(raw).slice(0, 1200);
      throw new Error(
        `Chatterbox generation failed (${upstream.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    if (type.toLowerCase().includes("json")) {
      const payload = JSON.parse(new TextDecoder().decode(raw)) as {
        audio?: { url?: string; content_type?: string; file_data?: string };
        error?: string;
      };
      if (payload.error) throw new Error(`Chatterbox generation error: ${payload.error}`);
      if (payload.audio?.file_data)
        return audioResponse(
          decodeAudio(payload.audio.file_data).bytes,
          payload.audio.content_type || "audio/wav",
        );
      if (payload.audio?.url) {
        const audio = await fetch(payload.audio.url);
        if (!audio.ok) throw new Error(`Chatterbox returned unusable audio (${audio.status}).`);
        return audioResponse(
          new Uint8Array(await audio.arrayBuffer()),
          audio.headers.get("content-type") || "audio/wav",
        );
      }
      throw new Error("Chatterbox completed without returning audio.");
    }
    if (type.toLowerCase().startsWith("audio/")) return audioResponse(raw, type);
    throw new Error("Chatterbox returned no usable audio result.");
  } catch (error) {
    return Response.json(
      {
        ok: false,
        backend: BACKEND,
        version: VERSION,
        error: error instanceof Error ? error.message : "Voice cloning failed.",
      },
      { status: 502, headers: headers() },
    );
  }
}
