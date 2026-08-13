  });
}
async function runCloudflare(
  provider: FreeRunner,
  input: StudioJobInput,
  capability: StudioCapability,
): Promise<StudioArtifact> {
  const prompt =
    typeof input.prompt === "string"
      ? input.prompt.trim()
      : String(input.text ?? input.lyrics ?? "").trim();
  const payload: Record<string, unknown> = {
    capability,
    prompt,
    language: typeof input.language === "string" ? input.language : undefined,
    messages: Array.isArray(input.messages) ? input.messages : undefined,
  };
  if (capability === "speech-to-text" && input.audio instanceof Blob)
    payload.audioBase64 = await blobToBase64(input.audio);
  const response = await fetch(provider.url, {
