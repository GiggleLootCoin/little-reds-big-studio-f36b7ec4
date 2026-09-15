import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
const wrapper = [
  'import studioServer from "./server.js";',
  'import { handleProductionQwenVoiceClone } from "../../src/lib/qwen-production-gateway-v2.ts";',
  'function health(env){return Response.json({ok:true,capability:"voice-clone",backend:"Qwen3-TTS Gradio gateway",models:["0.6B","1.7B"],qwenSpaceConfigured:Boolean(env?.QWEN_TTS_SPACE_URL)},{headers:{"cache-control":"no-store"}})}',
  'export default{async fetch(request,env,ctx){const url=new URL(request.url);const path=url.pathname.replace(/\\/$/,"")||"/";if(path==="/api/ai/voice-clone"&&request.method==="GET")return health(env);if((path==="/api/ai/voice-clone"||path==="/api/voice-clone")&&request.method==="POST"){const r=path==="/api/ai/voice-clone"?new Request(new URL("/api/voice-clone",request.url),request):request;return handleProductionQwenVoiceClone(r,env)}return studioServer.fetch(request,env,ctx)}};',
].join("\n");
await writeFile("dist/server/worker-wrapper.js", wrapper, "utf8");
