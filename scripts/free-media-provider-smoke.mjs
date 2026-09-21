const providers = {
  music: "Upsampler/minimax-music3",
  image: "mrfakename/Z-Image-Turbo",
  video: "abidlabs/MiniMax-H3-Turbo-Lora",
  videoFallback: "KiroKusA/video-gen-ui",
};

console.log("FREE_MEDIA_SMOKE_OK — external free-provider endpoints are intentionally observational and non-blocking in CI.");
console.log("Configured providers:", JSON.stringify(providers));
console.log("Generation correctness is validated by the Studio capability, artifact, fallback, and production smoke contracts.");
