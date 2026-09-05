import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const base = process.env.PRODUCTION_URL;
const sampleUrl = process.env.SAMPLE_URL;
if (!base || !sampleUrl) throw new Error("PRODUCTION_URL and SAMPLE_URL are required");

const sourcePath = "/tmp/live-voice-reference-source.mp3";
const samplePath = "/tmp/live-voice-reference.wav";
const source = await fetch(sampleUrl).then(async (r) => {
  if (!r.ok) throw new Error(`reference download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
});
await writeFile(sourcePath, source);
await execFileAsync("ffmpeg", [
  "-y", "-v", "error", "-i", sourcePath, "-t", "10", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", samplePath,
]);
const sampleBytes = await readFile(samplePath);
const audioBase64 = sampleBytes.toString("base64");
const referenceId = createHash("sha256").update(sampleBytes).digest("hex");

const sttResponse = await fetch(`${base}/api/ai/speech-to-text?android_smoke=1&ts=${Date.now()}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ audioBase64, language: "en" }),
});
if (!sttResponse.ok) throw new Error(`production STT returned HTTP ${sttResponse.status}: ${(await sttResponse.text()).slice(0, 300)}`);
const stt = await sttResponse.json();
const refText = String(stt.text || stt.transcription || "").trim();
if (!refText) throw new Error("production STT returned no transcript for the Red reference");

async function cloneRequest(extra = {}) {
  return fetch(`${base}/api/ai/voice-clone?android_smoke=1&ts=${Date.now()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ referenceId, audioBase64, audioType: "audio/wav", text: "Hello. This is the live Android browser playback test.", language: "en", ...extra }),
  });
}

function assertCloneResponse(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}: ${(response._errorText || "").slice(0, 300)}`);
}

async function readClone(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/^audio\//i.test(contentType) && !/^application\/octet-stream(?:;|$)/i.test(contentType))
    throw new Error(`unexpected ${label} MIME: ${contentType}`);
  const provider = response.headers.get("x-clone-provider") || "";
  const route = response.headers.get("x-red-voice-route") || "";
  if (provider !== "VoxCPM2 reference clone") throw new Error(`${label} used unexpected provider: ${provider || "missing"}`);
  if (route !== "voxcpm2-reference-clone") throw new Error(`${label} used unexpected route: ${route || "missing"}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength <= 4096) throw new Error(`${label} audio is too small: ${bytes.byteLength} bytes`);
  return { bytes, contentType, provider, route };
}

const transcriptClone = await readClone(await cloneRequest({ refText }), "production transcript clone");
const defaultClone = await readClone(await cloneRequest({}), "production default Red clone");

const presetVoices = ["Ryan", "Aiden", "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ono_Anna", "Sohee"];
const presetResults = [];
for (const speaker of presetVoices) {
  const response = await fetch(`${base}/api/ai/tts?android_smoke=1&ts=${Date.now()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ speaker, language: "en", text: `Hello. This is Buddy's ${speaker} preset voice test.` }),
  });
  if (!response.ok) throw new Error(`production preset ${speaker} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/^audio\//i.test(contentType)) throw new Error(`production preset ${speaker} returned unexpected MIME: ${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength <= 4096) throw new Error(`production preset ${speaker} audio is too small: ${bytes.byteLength} bytes`);
  presetResults.push({ speaker, bytes: bytes.byteLength, contentType });
}

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" });
  const page = await context.newPage();
  await page.goto(`${base}/?android_smoke=1`, { waitUntil: "networkidle", timeout: 60000 });
  const playback = await page.evaluate(async ({ bytes, contentType }) => {
    const data = Uint8Array.from(bytes);
    const blob = new Blob([data], { type: contentType || "audio/wav" });
    const url = URL.createObjectURL(blob);
    try {
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(data.buffer.slice(0));
      let peak = 0, sumSquares = 0, count = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const samples = decoded.getChannelData(channel);
        const step = Math.max(1, Math.floor(samples.length / 200000));
        for (let i = 0; i < samples.length; i += step) {
          const sample = samples[i];
          peak = Math.max(peak, Math.abs(sample));
          sumSquares += sample * sample;
          count++;
        }
      }
      const rms = Math.sqrt(sumSquares / Math.max(1, count));
      if (!(decoded.duration > 0.25)) throw new Error(`decoded duration unusable: ${decoded.duration}`);
      if (!(peak >= 0.005 && rms >= 0.0005)) throw new Error(`decoded audio is silent: peak=${peak}, rms=${rms}`);
      const audio = new Audio(url);
      audio.preload = "auto";
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("HTMLAudioElement metadata timeout")), 10000);
        audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
        audio.onerror = () => { clearTimeout(timer); reject(new Error("HTMLAudioElement could not decode production Blob URL")); };
        audio.load();
      });
      if (!(audio.duration > 0.25)) throw new Error(`HTMLAudioElement duration unusable: ${audio.duration}`);
      await audio.play();
      if (audio.paused) throw new Error("HTMLAudioElement.play() resolved but playback remained paused");
      audioContext.close();
      return { contentType, bytes: data.byteLength, duration: decoded.duration, peak, rms, htmlAudioDuration: audio.duration, paused: audio.paused };
    } finally { URL.revokeObjectURL(url); }
  }, { bytes: [...defaultClone.bytes], contentType: defaultClone.contentType });
  console.log(JSON.stringify({ status: "ok", referenceTranscript: refText, transcriptCloneBytes: transcriptClone.bytes.byteLength, defaultRedCloneBytes: defaultClone.bytes.byteLength, defaultRedProvider: defaultClone.provider, defaultRedRoute: defaultClone.route, presetResults, androidPlayback: playback }, null, 2));
  await context.close();
} catch (error) {
  console.error(`::error::ANDROID_BROWSER_VOICE_TEST ${error instanceof Error ? error.message : String(error)}`);
  throw error;
} finally {
  await browser.close();
}
