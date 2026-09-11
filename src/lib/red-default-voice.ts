const BUILT_IN_RED_VOICE_URLS = [
  "/red_voice_mic_device10_20s_D.wav",
  "/red_voice_mic_device10_30s_C.wav",
] as const;

let cachedSample: Blob | null = null;
let loadingSample: Promise<Blob | null> | null = null;

export async function getBuiltInRedVoiceSample(): Promise<Blob | null> {
  if (cachedSample?.size) return cachedSample;
  if (typeof window === "undefined") return null;
  if (!loadingSample) {
    loadingSample = (async () => {
      for (const url of BUILT_IN_RED_VOICE_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) continue;
          const blob = await response.blob();
          if (!blob.size) continue;
          cachedSample = blob;
          return blob;
        } catch {}
      }
      return null;
    })().finally(() => {
      loadingSample = null;
    });
  }
  return loadingSample;
}
