type Env = { HF_TOKEN?: string; QWEN_TTS_SPACE_URL?: string };
type CachedReference = { path: string; expires: number };
const referenceCache = new Map<string, CachedReference>();
const REFERENCE_TTL_MS = 15 * 60 * 1000;
const auth = (env: Env): HeadersInit => env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {};
const languageName = (value: unknown) => {
  const raw = String(value || "English").trim().toLowerCase();
  const names: Record<string, string> = { en: "English", english: "English", es: "Spanish", spanish: "Spanish", fr: "French", french: "French", de: "German", german: "German", it: "Italian", italian: "Italian", pt: "Portuguese", portuguese: "Portuguese", ru: "Russian", russian: "Russian", zh: "Chinese", chinese: "Chinese", ja: "Japanese", japanese: "Japanese", ko: "Korean", korean: "Korean", hi: "Hindi", hindi: "Hindi", ar: "Arabic", arabic: "Arabic", auto: "Auto" };
  return names[raw] || String(value || "English").trim();
};
const extensionFor = (mime: string) => mime.toLowerCase().includes("mpeg") ? "mp3" : mime.toLowerCase().includes("mp4") ? "m4a" : mime.toLowerCase().includes("webm") ? "webm" : mime.toLowerCase().includes("ogg") ? "ogg" : "wav";
const decodeBase64 = (value: string) => Uint8Array.from(atob(value.replace(/^data:[^,]+,/, "").replace(/\s/g, "")), c => c.charCodeAt(0));
const gatewayError = (message: string, status = 502) => Response.json({ ok: false, error: message }, { status, headers: { "cache-control": "no-store" } });
function findAudio(value: unknown): unknown {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) { for (const item of value) { const found = findAudio(item); if (found !== undefined) return found; } return undefined; }
  const record = value as Record<string, unknown>;
  for (const key of ["url", "path", "audio", "file", "fileData", "output", "data"]) { const found = findAudio(record[key]); if (found !== undefined) return found; }
  return undefined;
}
function parseQwenSSE(stream: string): { audio?: unknown; error?: string } {
  let event = "", data: string[] = [], audio: unknown, terminalError = "", completionStatus = "";
  const flush = () => {
    if (!data.length) return;
    const payload = data.join("\n").trim(); if (!payload) return;
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { if (event === "error" || event === "cancelled") terminalError = payload; return; }
    if (event === "error" || event === "cancelled") { terminalError = typeof parsed === "string" ? parsed : JSON.stringify(parsed); return; }
    if (event !== "complete") return;
    if (Array.isArray(parsed)) {
      const first = parsed[0], second = parsed[1];
      if (typeof second === "string") completionStatus = second.trim();
      const found = findAudio(first);
      if (found !== undefined) audio = found;
      else if (/^Error:/i.test(completionStatus)) terminalError = completionStatus;
    } else {
      const found = findAudio(parsed);
      if (found !== undefined) audio = found;
      else if (parsed && typeof parsed === "object") { const status = String((parsed as Record<string, unknown>).status || ""); if (/^Error:/i.test(status)) terminalError = status; }
    }
  };
  for (const line of stream.split(/\r\n|\n|\r/)) {
    if (!line.trim()) { flush(); event = ""; data = []; continue; }
    if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  flush();
  if (audio !== undefined) return { audio };
  if (terminalError) return { error: terminalError };
  if (completionStatus) return { error: `Qwen completed without audio: ${completionStatus}` };
  return { error: "Qwen completed without returning an audio artifact." };
}
async function uploadReference(space: string, bytes: Uint8Array, mime: string, env: Env) {
  const form = new FormData(); const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  form.append("files", new Blob([buffer], { type: mime }), `reference.${extensionFor(mime)}`);
  const response = await fetch(`${space}/gradio_api/upload`, { method: "POST", headers: auth(env), body: form });
  if (!response.ok) throw new Error(`Qwen reference upload failed (${response.status}). ${(await response.text()).slice(0, 300)}`);
  const result = await response.json() as unknown;
  if (Array.isArray(result) && typeof result[0] === "string") return result[0];
  if (Array.isArray(result)) { const path = findAudio(result[0]); if (typeof path === "string") return path; }
  throw new Error("Qwen returned no uploaded reference path.");
}
async function getReferencePath(referenceId: string, audioBase64: string | undefined, audioType: string, space: string, env: Env) {
  const cached = referenceCache.get(referenceId); if (cached && cached.expires > Date.now()) return cached.path;
  if (!audioBase64) throw new Error("The saved voice reference expired from the warm server. Please retry once to refresh it.");
  const path = await uploadReference(space, decodeBase64(audioBase64), audioType, env);
  referenceCache.set(referenceId, { path, expires: Date.now() + REFERENCE_TTL_MS }); return path;
}
async function generateOnce(space: string, referencePath: string, input: { audioType: string; refText: string; text: string; language?: string; modelSize: "0.6B" | "1.7B" }, env: Env) {
  const file = { path: referencePath, orig_name: `reference.${extensionFor(input.audioType)}`, mime_type: input.audioType, meta: { _type: "gradio.FileData" } };
  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, { method: "POST", headers: { ...auth(env), "content-type": "application/json" }, body: JSON.stringify({ data: [file, input.refText, input.text, languageName(input.language), false, input.modelSize] }) });
  if (!start.ok) throw new Error(`Qwen ${input.modelSize} clone job could not start (${start.status}). ${(await start.text()).slice(0, 400)}`);
  const started = await start.json() as { event_id?: string }; if (!started.event_id) throw new Error(`Qwen ${input.modelSize} did not return a clone job ID.`);
  const result = await fetch(`${space}/gradio_api/call/generate_voice_clone/${encodeURIComponent(started.event_id)}`, { headers: { ...auth(env), Accept: "text/event-stream" } });
  if (!result.ok) throw new Error(`Qwen ${input.modelSize} clone job failed (${result.status}). ${(await result.text()).slice(0, 400)}`);
  const parsed = parseQwenSSE(await result.text());
  if (parsed.error) throw new Error(`Qwen ${input.modelSize}: ${parsed.error.slice(0, 600)}`);
  if (parsed.audio === undefined) throw new Error(`Qwen ${input.modelSize}: no completed clone audio.`);
  const item = parsed.audio;
  const url = typeof item === "string" ? item : item && typeof item === "object" ? String((item as Record<string, unknown>).url || "") : "";
  const path = item && typeof item === "object" ? String((item as Record<string, unknown>).path || "") : "";
  if (url) return url.startsWith("http") ? url : `${space}${url}`;
  if (path) return `${space}/gradio_api/file=${path.replace(/^\//, "")}`;
  throw new Error(`Qwen ${input.modelSize}: audio artifact had no downloadable URL or path.`);
}
export async function handleProductionQwenVoiceClone(request: Request, env: Env) {
  if (request.method !== "POST") return gatewayError("POST required.", 405);
  let body: { referenceId?: string; audioBase64?: string; audioType?: string; refText?: string; text?: string; language?: string; modelSize?: "0.6B" | "1.7B" };
  try { body = await request.json() as typeof body; } catch { return gatewayError("The clone request was not valid JSON.", 400); }
  if (!body.referenceId?.trim()) return gatewayError("A voice reference ID is required.", 400);
  if (!body.refText?.trim()) return gatewayError("The exact transcript of the reference recording is required.", 400);
  if (!body.text?.trim()) return gatewayError("Target text is required.", 400);
  const space = String(env.QWEN_TTS_SPACE_URL || "https://qwen-qwen3-tts.hf.space").replace(/\/$/, "");
  const audioType = String(body.audioType || "audio/wav");
  try {
    const referencePath = await getReferencePath(body.referenceId.trim(), body.audioBase64, audioType, space, env);
    const requestedSize = body.modelSize === "1.7B" ? "1.7B" : "0.6B";
    const firstSize = requestedSize, secondSize = requestedSize === "0.6B" ? "1.7B" : "0.6B";
    const common = { audioType, refText: body.refText.trim(), text: body.text.trim().replace(/\s+/g, " ").slice(0, 220), language: body.language };
    let generatedUrl: string;
    try { generatedUrl = await generateOnce(space, referencePath, { ...common, modelSize: firstSize }, env); }
    catch (firstError) {
      generatedUrl = await generateOnce(space, referencePath, { ...common, modelSize: secondSize }, env).catch(secondError => { throw new Error(`Qwen clone failed on both Base sizes. ${firstSize}: ${firstError instanceof Error ? firstError.message : String(firstError)} | ${secondSize}: ${secondError instanceof Error ? secondError.message : String(secondError)}`); });
    }
    const generated = await fetch(generatedUrl, { headers: auth(env) });
    if (!generated.ok || !generated.body) throw new Error(`Qwen generated audio could not be downloaded (${generated.status}).`);
    const headers = new Headers(generated.headers); headers.set("cache-control", "no-store"); headers.set("x-clone-provider", "Qwen3-TTS Base"); headers.delete("x-clone-verified");
    return new Response(generated.body, { status: 200, headers });
  } catch (error) { return gatewayError(error instanceof Error ? error.message : "Qwen voice cloning failed."); }
}
