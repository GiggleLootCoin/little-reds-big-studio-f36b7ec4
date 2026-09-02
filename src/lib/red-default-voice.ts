const BUILT_IN_RED_VOICE_URL = "/13.7s Recording (Jul 2 @ 5_53 PM).mp3";

let cachedSample: Blob | null = null;
let loadingSample: Promise<Blob | null> | null = null;

export async function getBuiltInRedVoiceSample(): Promise<Blob | null> {
  if (cachedSample?.size) return cachedSample;
  if (typeof window === "undefined") return null;
  if (!loadingSample) {
    loadingSample = fetch(BUILT_IN_RED_VOICE_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Built-in Red voice reference failed (${response.status}).`);
        return response.blob();
      })
      .then((blob) => {
        if (!blob.size) throw new Error("Built-in Red voice reference is empty.");
        cachedSample = blob;
        return blob;
      })
      .catch(() => null)
      .finally(() => {
        loadingSample = null;
      });
  }
  return loadingSample;
}
