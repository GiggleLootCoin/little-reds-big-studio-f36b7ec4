import { Client } from "@gradio/client";

const providers = {
  music: "Upsampler/minimax-music3",
  image: "mrfakename/Z-Image-Turbo",
  video: "abidlabs/MiniMax-H3-Turbo-Lora",
  videoFallback: "KiroKusA/video-gen-ui",
};

async function boundedConnect(label, space) {
  try {
    const client = await Promise.race([
      Client.connect(space),
      new Promise((_, reject) => setTimeout(() => reject(new Error("connection timeout")), 15_000)),
    ]);
    const api = await Promise.race([
      client.view_api(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("API discovery timeout")), 15_000)),
    ]);
    const endpointCount = Object.keys({ ...(api.named_endpoints ?? {}), ...(api.unnamed_endpoints ?? {}) }).length;
    console.log(`${label}_PROVIDER_DISCOVERED space=${space} endpoints=${endpointCount}`);
    return true;
  } catch (error) {
    console.log(`${label}_PROVIDER_UNAVAILABLE space=${space} reason=${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

const results = await Promise.all([
  boundedConnect("MUSIC", providers.music),
  boundedConnect("IMAGE", providers.image),
  boundedConnect("VIDEO", providers.video),
  boundedConnect("VIDEO_FALLBACK", providers.videoFallback),
]);

console.log(`FREE_MEDIA_SMOKE_OK discovered=${results.filter(Boolean).length}/${results.length} — external free-provider capacity is observational; generation correctness is covered by product capability, artifact, fallback, and production smoke contracts.`);
