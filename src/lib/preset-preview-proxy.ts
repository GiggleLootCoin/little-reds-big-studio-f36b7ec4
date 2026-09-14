const PRESET_PREVIEW_UPSTREAMS: Record<string, string> = {
  Ryan: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ryan_English.wav",
  Aiden: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/aiden_English.wav",
  Vivian: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/vivian_English.wav",
  Serena: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/serena_English.wav",
  Uncle_Fu: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/uncle_fu_English.wav",
  Dylan: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/dylan_English.wav",
  Eric: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/eric_English.wav",
  Ono_Anna: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/ono_anna_English.wav",
  Sohee: "https://huggingface.co/datasets/malaiwah/qwen3-tts-customvoice-ab-clips/resolve/main/original/sohee_English.wav",
};

export async function proxyPresetPreview(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const prefix = "/api/preset-preview/";
  if (!url.pathname.startsWith(prefix)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("GET required.", { status: 405 });

  const speaker = decodeURIComponent(url.pathname.slice(prefix.length)).trim();
  const upstreamUrl = PRESET_PREVIEW_UPSTREAMS[speaker];
  if (!upstreamUrl) return new Response("Unknown preset preview.", { status: 404 });

  const range = request.headers.get("range");
  const headers = new Headers();
  headers.set("accept", "audio/wav,audio/*;q=0.9,*/*;q=0.8");
  if (range) headers.set("range", range);

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    redirect: "follow",
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!upstream.ok && upstream.status !== 206) return new Response("Preset preview unavailable.", { status: upstream.status });

  const responseHeaders = new Headers();
  responseHeaders.set("content-type", "audio/wav");
  responseHeaders.set("accept-ranges", "bytes");
  responseHeaders.set("cache-control", "public, max-age=86400, immutable");
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
