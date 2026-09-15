import { Client } from "@gradio/client";

async function getFileValue(value, label) {
  if (value instanceof Blob) { if (!value.size) throw new Error(`${label} returned an empty Blob.`); return value; }
  const url = typeof value === "string" ? value : value?.url;
  if (!url) throw new Error(`${label} returned no downloadable artifact.`);
  const response = await fetch(url); if (!response.ok) throw new Error(`${label} artifact download failed with ${response.status}.`);
  const blob = await response.blob(); if (!blob.size) throw new Error(`${label} returned an empty artifact.`); return blob;
}

async function smokeMusic() {
  const client = await Client.connect("Upsampler/minimax-music3");
  const response = await client.predict("/generate_music", ["A short upbeat instrumental synth-pop test track", 10, 7, true, ""]);
  const values = (response.data ?? []).flat(Infinity);
  const file = values.find((value) => value && typeof value === "object" && (value.url || value.path)) ?? values[0];
  const blob = await getFileValue(file, "MiniMax Music 3");
  if (!blob.type.startsWith("audio/")) throw new Error(`Music smoke returned ${blob.type}, not audio.`);
  console.log(`MUSIC_OK bytes=${blob.size} type=${blob.type}`);
}

async function smokeImage() {
  const client = await Client.connect("mrfakename/Z-Image-Turbo");
  const api = await client.view_api();
  const endpoints = { ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) };
  const candidates = Object.entries(endpoints).filter(([, endpoint]) => (endpoint.parameters ?? []).some((parameter) => { const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase(); return key.includes("prompt") || key === "text"; }));
  if (!candidates.length) throw new Error("Z-Image Turbo exposes no prompt endpoint.");
  let lastError = null;
  for (const [name, endpoint] of candidates) {
    try {
      const args = (endpoint.parameters ?? []).map((parameter) => { const key = (parameter.parameter_name ?? parameter.label ?? "").toLowerCase(); if (key.includes("prompt") || key === "text") return "A cinematic red moon over a quiet city, cover-art test image"; if (key.includes("seed")) return 7; if (key.includes("width")) return 512; if (key.includes("height")) return 512; if (key.includes("steps")) return 8; if (parameter.default !== undefined) return parameter.default; if (parameter.optional || parameter.parameter_has_default) return undefined; return undefined; });
      const response = await client.predict(name, args); const values = (response.data ?? []).flat(Infinity); const file = values.find((value) => value && typeof value === "object" && (value.url || value.path)) ?? values.find((value) => typeof value === "string"); const blob = await getFileValue(file, `Z-Image Turbo ${name}`);
      if (!blob.type.startsWith("image/")) throw new Error(`Image smoke returned ${blob.type}, not image.`);
      console.log(`IMAGE_OK endpoint=${name} bytes=${blob.size} type=${blob.type}`); return;
    } catch (error) { lastError = error; }
  }
  throw lastError ?? new Error("Z-Image Turbo generation failed.");
}

for (const [name, fn] of Object.entries({ music: smokeMusic, image: smokeImage })) { console.log(`START_${name.toUpperCase()}`); await fn(); }
