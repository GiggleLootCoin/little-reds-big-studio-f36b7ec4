type Env = { HF_TOKEN?: string; QWEN_TTS_SPACE_URL?: string };
type CloneBody = { referenceId?: string; audioBase64?: string; audioType?: string; refText?: string; text?: string; language?: string; modelSize?: "0.6B" | "1.7B" };
const DEFAULT_QWEN_SPACE = "https://qwen-qwen3-tts.hf.space";
const referenceCache = new Map<string, { path: string; expires: number }>();
const TTL = 15 * 60 * 1000;
function auth(env: Env): HeadersInit { return env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {}; }
function ext(type: string) { const t = type.toLowerCase(); return t.includes("webm") ? "webm" : t.includes("mpeg") ? "mp3" : t.includes("ogg") ? "ogg" : "wav"; }
function decode(value: string): ArrayBuffer { const cleaned = value.replace(/^data:[^,]+,/, "").replace(/\s/g, ""); const b = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
async function referencePath(space: string, id: string, audioBase64: string, type: string, env: Env, refresh = false) {
  const key = `${space}|${id}`; const cached = referenceCache.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.path;
  const form = new FormData(); form.append("files", new Blob([decode(audioBase64)], { type }), `red-reference.${ext(type)}`);
  const r = await fetch(`${space}/gradio_api/upload`, { method: "POST", headers: auth(env), body: form });
  if (!r.ok) throw new Error(`Qwen reference upload failed (${r.status}).`);
  const files = await r.json() as unknown;
  if (!Array.isArray(files) || typeof files[0] !== "string") throw new Error("Qwen returned no reference path.");
  referenceCache.set(key, { path: files[0], expires: Date.now() + TTL }); return files[0];
}
export type QwenSSEParseResult = { kind: "audio"; payload: unknown[] } | { kind: "error"; message: string } | { kind: "none" };
export function parseQwenSSE(stream: string): QwenSSEParseResult {
  let event = "", data: string[] = [], result: QwenSSEParseResult = { kind: "none" };
  const flush = () => { if (!data.length) return; const raw = data.join("\n").trim(); if (!raw) return;
    if (event === "error" || event === "cancelled") { try { const p = JSON.parse(raw) as unknown; result = { kind: "error", message: typeof p === "string" ? p : JSON.stringify(p) }; } catch { result = { kind: "error", message: raw }; } return; }
    if (event !== "complete") return; try { const p = JSON.parse(raw) as unknown; if (Array.isArray(p) && p[0]) result = { kind: "audio", payload: p }; } catch { result = { kind: "error", message: "Qwen returned invalid completed JSON." }; }
  };
  for (const line of stream.split(/\r\n|\n|\r/)) { if (!line.trim()) { flush(); event = ""; data = []; } else if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trim()); } flush(); return result;
}
function fileData(path: string, type: string) { return { path, orig_name: `red-reference.${ext(type)}`, mime_type: type, meta: { _type: "gradio.FileData" } }; }
function wav(tuple: unknown): ArrayBuffer | null {
  if (!Array.isArray(tuple) || typeof tuple[0] !== "number" || !Array.isArray(tuple[1]) || !tuple[1].length) return null;
  const sr = Math.round(tuple[0]); const samples = tuple[1] as unknown[]; const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) { const n = Math.max(-1, Math.min(1, Number(samples[i]) || 0)); pcm[i] = n < 0 ? n * 0x8000 : n * 0x7fff; }
  const out = new ArrayBuffer(44 + pcm.byteLength), v = new DataView(out); const put = (o: number, s: string) => [...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0));
  put(0,"RIFF"); v.setUint32(4,36+pcm.byteLength,true); put(8,"WAVE"); put(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true); put(36,"data"); v.setUint32(40,pcm.byteLength,true); new Uint8Array(out,44).set(new Uint8Array(pcm.buffer)); return out;
}
async function clone(space: string, path: string, type: string, refText: string, text: string, language: string, size: "0.6B"|"1.7B", env: Env): Promise<Response> {
  const start = await fetch(`${space}/gradio_api/call/generate_voice_clone`, { method:"POST", headers:{...auth(env),"content-type":"application/json"}, body:JSON.stringify({data:[fileData(path,type),refText,text,language,!refText,size]}) });
  if (!start.ok) throw new Error(`Qwen voice clone start failed (${start.status}).`); const job = await start.json() as {event_id?:string}; if (!job.event_id) throw new Error("Qwen returned no voice-clone job ID.");
  const r = await fetch(`${space}/gradio_api/call/generate_voice_clone/${encodeURIComponent(job.event_id)}`, {headers:{...auth(env),Accept:"text/event-stream"}}); if (!r.ok) throw new Error(`Qwen voice clone job failed (${r.status}).`);
  const parsed = parseQwenSSE(await r.text()); if (parsed.kind === "error") throw new Error(`Qwen voice clone: ${parsed.message.slice(0,500)}`); if (parsed.kind !== "audio") throw new Error("Qwen completed without cloned audio.");
  const w = wav(parsed.payload[0]); if (w) return new Response(w,{headers:{"content-type":"audio/wav","cache-control":"no-store","x-clone-provider":`Qwen3-TTS Base ${size} reference clone`,`x-red-voice-route":"qwen3-reference-clone"}});
  const item = parsed.payload[0] && typeof parsed.payload[0] === "object" ? parsed.payload[0] as Record<string,unknown> : null; const url = typeof parsed.payload[0] === "string" ? parsed.payload[0] : item && typeof item.url === "string" ? item.url : item && typeof item.path === "string" ? `${space}/gradio_api/file=${item.path.replace(/^\//,"")}` : ""; if (!url) throw new Error("Qwen returned no playable cloned audio artifact.");
  const audio = await fetch(url.startsWith("http") ? url : `${space}${url}`,{headers:auth(env)}); if (!audio.ok || !audio.body) throw new Error(`Qwen audio download failed (${audio.status}).`); const h = new Headers(audio.headers); h.set("cache-control","no-store"); h.set("x-clone-provider",`Qwen3-TTS Base ${size} reference clone`); h.set("x-red-voice-route","qwen3-reference-clone"); return new Response(audio.body,{status:200,headers:h});
}
export async function handleVoiceClone(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ok:false,error:"POST required."},{status:405}); let body: CloneBody; try { body = await request.json() as CloneBody; } catch { return Response.json({ok:false,error:"The clone request was not valid JSON."},{status:400}); }
  if (!body.referenceId?.trim() || !body.audioBase64) return Response.json({ok:false,error:"A Red voice reference is required."},{status:400}); if (!body.text?.trim()) return Response.json({ok:false,error:"Target text is required."},{status:400});
  const space = String(env.QWEN_TTS_SPACE_URL || DEFAULT_QWEN_SPACE).replace(/\/$/,""); const type = String(body.audioType || "audio/wav"); const id = body.referenceId.trim(); const text = body.text.trim().replace(/\s+/g," ").slice(0,220); const refText = body.refText?.trim() || ""; const language = String(body.language || "English"); const size = body.modelSize === "1.7B" ? "1.7B" : "0.6B";
  try { let path = await referencePath(space,id,body.audioBase64,type,env); try { return await clone(space,path,type,refText,text,language,size,env); } catch { path = await referencePath(space,id,body.audioBase64,type,env,true); return await clone(space,path,type,refText,text,language,size,env); } } catch (e) { return Response.json({ok:false,error:`Red voice cloning failed on Qwen3-TTS: ${e instanceof Error ? e.message : String(e)}`},{status:502,headers:{"cache-control":"no-store","x-red-voice-route":"qwen3-reference-clone"}}); }
}
