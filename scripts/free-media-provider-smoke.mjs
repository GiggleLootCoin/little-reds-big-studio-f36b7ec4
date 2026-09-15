import { Client } from "@gradio/client";

const providers = {
  music: "Upsampler/minimax-music3",
  image: "mrfakename/Z-Image-Turbo",
  video: "abidlabs/MiniMax-H3-Turbo-Lora",
  videoFallback: "KiroKusA/video-gen-ui",
};

async function getFileValue(value, label) {
  if (value instanceof Blob) {
    if (!value.size) throw new Error(`${label} returned an empty Blob.`);
    return value;
  }
  const url = typeof value === "string" ? value : value?.url;
  if (!url) throw new Error(`${label} returned no downloadable artifact.`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} artifact download failed with ${response.status}.`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`${label} returned an empty artifact.`);
  return blob;
}

async function smokeMusic() {
  try {
    const client = await Client.connect(providers.music);
    const response = await client.predict("/generate_music", [
      "A short upbeat instrumental synth-pop test track",
      10,
      7,
      true,
      "",
    ]);
    const candidates = (response.data ?? []).flat(Infinity);
    const file =
      candidates.find((value) => value && typeof value === "object" && (value.url || value.path)) ??
      candidates[0];
    const blob = await getFileValue(file, "MiniMax Music 3");
    if (!blob.type.startsWith("audio/")) throw new Error(`Music smoke returned ${blob.type}, not audio.`);
    console.log(`MUSIC_OK bytes=${blob.size} type=${blob.type}`);
    return true;
  } catch (error) {
    console.log(
      `MUSIC_PROVIDER_UNAVAILABLE ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function smokeImage() {
  const client = await Client.connect(providers.image);
  const api = await client.view_api();
  const endpoints = { ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) };
  const candidates = Object.entries(endpoints).filter(([, endpoint]) =>
    (endpoint.parameters ?? []).some((parameter) => {
      const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase();
      return key.includes("prompt") || key === "text";
    }),
  );
  if (!candidates.length) throw new Error("Z-Image Turbo exposes no prompt endpoint.");
  let lastError = null;
  for (const [name, endpoint] of candidates) {
    try {
      const args = (endpoint.parameters ?? []).map((parameter) => {
        const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase();
        if (key.includes("prompt") || key === "text")
          return "A cinematic red moon over a quiet city, cover-art test image";
        if (key.includes("seed")) return 7;
        if (key.includes("width")) return 512;
        if (key.includes("height")) return 512;
        if (key.includes("steps")) return 8;
        if (parameter.default !== undefined) return parameter.default;
        if (parameter.optional || parameter.parameter_has_default) return undefined;
        return undefined;
      });
      const response = await client.predict(name, args);
      const values = (response.data ?? []).flat(Infinity);
      const file =
        values.find((value) => value && typeof value === "object" && (value.url || value.path)) ??
        values.find((value) => typeof value === "string");
      const blob = await getFileValue(file, `Z-Image Turbo ${name}`);
      if (!blob.type.startsWith("image/"))
        throw new Error(`Image smoke returned ${blob.type}, not image.`);
      console.log(`IMAGE_OK endpoint=${name} bytes=${blob.size} type=${blob.type}`);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Z-Image Turbo generation failed.");
}

async function predictVideoFallback(client) {
  const api = await client.view_api();
  const endpoints = { ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) };
  const candidates = Object.entries(endpoints).filter(([, endpoint]) =>
    (endpoint.parameters ?? []).some((parameter) => {
      const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase();
      return key.includes("prompt") || key.includes("text");
    }),
  );
  let lastError = null;
  for (const [name, endpoint] of candidates) {
    try {
      const args = (endpoint.parameters ?? []).map((parameter) => {
        const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase();
        if (key.includes("prompt") || key === "text")
          return "A cinematic red moon rising over a quiet city at night, slow camera movement";
        if (key.includes("negative")) return "blurry, distorted, low quality";
        if (key.includes("duration")) return 2;
        if (key.includes("seed")) return 7;
        if (key.includes("steps")) return 4;
        if (key.includes("guidance")) return key.includes("guidance_2") ? 3 : 1;
        if (key.includes("randomize")) return false;
        if (parameter.default !== undefined) return parameter.default;
        if (parameter.optional || parameter.parameter_has_default) return undefined;
        return undefined;
      });
      const response = await client.predict(name, args);
      const values = (response.data ?? []).flat(Infinity);
      const file =
        values.find((value) => value && typeof value === "object" && (value.url || value.path)) ??
        values.find((value) => typeof value === "string");
      const blob = await getFileValue(file, `Video ${name}`);
      if (!blob.type.startsWith("video/"))
        throw new Error(`Video smoke returned ${blob.type}, not video.`);
      console.log(`VIDEO_OK engine=video-gen-ui endpoint=${name} bytes=${blob.size} type=${blob.type}`);
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.log(
    `VIDEO_PROVIDER_UNAVAILABLE ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
  return false;
}

async function smokeVideo() {
  try {
    const client = await Client.connect(providers.video);
    const response = await client.predict("/predict_fn_generate_video", [
      "A cinematic red moon rising over a quiet city at night, slow camera movement",
      null,
      null,
      "960x544 · 16:9 fast",
      2,
      6,
      7,
      false,
      "larry",
    ]);
    const values = (response.data ?? []).flat(Infinity);
    const file =
      values.find((value) => value && typeof value === "object" && (value.url || value.path)) ??
      values[0];
    const blob = await getFileValue(file, "MiniMax H3 video");
    if (!blob.type.startsWith("video/")) throw new Error(`H3 smoke returned ${blob.type}, not video.`);
    console.log(`VIDEO_OK engine=H3 endpoint=/predict_fn_generate_video bytes=${blob.size} type=${blob.type}`);
    return true;
  } catch (error) {
    console.log(`VIDEO_H3_UNAVAILABLE ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return await predictVideoFallback(await Client.connect(providers.videoFallback));
  } catch (error) {
    console.log(`VIDEO_FALLBACK_UNAVAILABLE ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

for (const [name, fn] of Object.entries({ music: smokeMusic, image: smokeImage, video: smokeVideo })) {
  try {
    console.log(`START_${name.toUpperCase()}`);
    const result = await fn();
    if (result === false) {
      console.log(
        `${name.toUpperCase()}_OPTIONAL_UNAVAILABLE — external free-provider capacity is not a product failure; the Studio must use its configured runtime/fallback path.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `${name.toUpperCase()}_OPTIONAL_UNAVAILABLE ${message} — external free-provider failure is recorded, not promoted to a CI product failure.`,
    );
  }
}

console.log(
  "FREE_MEDIA_SMOKE_OK — live free-provider availability is observational; product correctness is validated separately by capability, artifact, and fallback contract tests.",
);
