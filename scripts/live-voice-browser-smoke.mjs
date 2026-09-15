import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const base = process.env.PRODUCTION_URL;
const sampleUrl = process.env.SAMPLE_URL;
const sttSampleUrl = process.env.STT_SAMPLE_URL;
if (!base || !sampleUrl || !sttSampleUrl) throw new Error("PRODUCTION_URL, SAMPLE_URL and STT_SAMPLE_URL are required");

async function prepareSample(url, prefix) {
  const sourcePath = `/tmp/${prefix}-source.mp3`;
  const samplePath = `/tmp/${prefix}.wav`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${prefix} reference download failed: ${response.status}`);
  await writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
  await execFileAsync("ffmpeg", ["-y", "-v", "error", "-i", sourcePath, "-t", "10", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", samplePath]);
  return readFile(samplePath);
}

const redSampleBytes = await prepareSample(sampleUrl, "live-voice-reference");
const sttSampleBytes = await prepareSample(sttSampleUrl, "live-stt-reference");
const redAudioBase64 = redSampleBytes.toString("base64");
const sttAudioBase64 = sttSampleBytes.toString("base64");
const referenceId = createHash("sha256").update(redSampleBytes).digest("hex");

const sttResponse = await fetch(`${base}/api/ai/speech-to-text?android_smoke=1&ts=${Date.now()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audioBase64: sttAudioBase64, language: "en" }) });
let sttText = "";
let sttAvailability = "verified";
if (sttResponse.ok) {
  const stt = await sttResponse.json();
  sttText = String(stt.text || stt.transcription || "").trim();
  if (!sttText) throw new Error("production STT returned no transcript for the known speech reference");
} else {
  const sttError = (await sttResponse.text()).slice(0, 500);
  if (sttResponse.status === 503 && /capacity|allocation|temporarily unavailable/i.test(sttError)) {
    sttAvailability = "temporarily-unavailable";
    console.log(`STT_PROVIDER_UNAVAILABLE ${sttError}`);
  } else {
    throw new Error(`production STT returned HTTP ${sttResponse.status}: ${sttError.slice(0, 300)}`);
  }
}

const cloneResponse = await fetch(`${base}/api/ai/voice-clone?android_smoke=1&ts=${Date.now()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ referenceId, audioBase64: redAudioBase64, audioType: "audio/wav", text: "Hello. This is the live Android browser playback test.", language: "en" }) });
if (!cloneResponse.ok) throw new Error(`production default Red clone returned HTTP ${cloneResponse.status}: ${(await cloneResponse.text().catch(() => "")).slice(0, 300)}`);
const contentType = cloneResponse.headers.get("content-type") || "";
if (!/^audio\//i.test(contentType) && !/^application\/octet-stream(?:;|$)/i.test(contentType)) throw new Error(`unexpected Red clone MIME: ${contentType}`);
const provider = cloneResponse.headers.get("x-clone-provider") || "";
const route = cloneResponse.headers.get("x-red-voice-route") || "";
if (provider !== "Qwen3-TTS reference clone") throw new Error(`Red clone used unexpected provider: ${provider || "missing"}`);
if (route !== "qwen3-tts-reference-clone") throw new Error(`Red clone used unexpected route: ${route || "missing"}`);
const cloneBytes = Buffer.from(await cloneResponse.arrayBuffer());
if (cloneBytes.byteLength <= 4096) throw new Error(`Red clone audio is too small: ${cloneBytes.byteLength} bytes`);

const presetVoices = ["Ryan", "Aiden", "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ono_Anna", "Sohee"];
const presetResults = [];
for (const speaker of presetVoices) {
  const response = await fetch(`${base}/api/ai/tts?android_smoke=1&ts=${Date.now()}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ speaker, language: "en", text: `Hello. This is Buddy's ${speaker} preset voice test.` }) });
  if (!response.ok) throw new Error(`production preset ${speaker} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const type = response.headers.get("content-type") || ""; if (!/^audio\//i.test(type)) throw new Error(`production preset ${speaker} returned unexpected MIME: ${type}`);
  const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.byteLength <= 4096) throw new Error(`production preset ${speaker} audio is too small: ${bytes.byteLength} bytes`); presetResults.push({ speaker, bytes: bytes.byteLength, contentType: type });
}

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" });
  const page = await context.newPage(); await page.goto(`${base}/?android_smoke=1`, { waitUntil: "networkidle", timeout: 60000 });
  const playback = await page.evaluate(async ({ bytes, contentType }) => {
    const data = Uint8Array.from(bytes), blob = new Blob([data], { type: contentType || "audio/wav" }), url = URL.createObjectURL(blob);
    try {
      const audioContext = new AudioContext(), decoded = await audioContext.decodeAudioData(data.buffer.slice(0)); let peak = 0, sumSquares = 0, count = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) { const samples = decoded.getChannelData(channel), step = Math.max(1, Math.floor(samples.length / 200000)); for (let i = 0; i < samples.length; i += step) { const sample = samples[i]; peak = Math.max(peak, Math.abs(sample)); sumSquares += sample * sample; count++; } }
      const rms = Math.sqrt(sumSquares / Math.max(1, count)); if (!(decoded.duration > 0.25)) throw new Error(`decoded duration unusable: ${decoded.duration}`); if (!(peak >= 0.005 && rms >= 0.0005)) throw new Error(`decoded audio is silent: peak=${peak}, rms=${rms}`);
      const audio = new Audio(url); audio.preload = "auto"; await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("HTMLAudioElement metadata timeout")), 10000); audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; audio.onerror = () => { clearTimeout(timer); reject(new Error("HTMLAudioElement could not decode production Blob URL")); }; audio.load(); }); if (!(audio.duration > 0.25)) throw new Error(`HTMLAudioElement duration unusable: ${audio.duration}`); await audio.play(); if (audio.paused) throw new Error("HTMLAudioElement.play() resolved but playback remained paused"); audioContext.close(); return { contentType, bytes: data.byteLength, duration: decoded.duration, peak, rms, htmlAudioDuration: audio.duration, paused: audio.paused };
    } finally { URL.revokeObjectURL(url); }
  }, { bytes: [...cloneBytes], contentType });
  console.log(JSON.stringify({ status: "ok", sttAvailability, sttTranscript: sttText, redCloneBytes: cloneBytes.byteLength, redCloneProvider: provider, redCloneRoute: route, presetResults, androidPlayback: playback }, null, 2));
  await context.close();
} catch (error) { console.error(`::error::ANDROID_BROWSER_VOICE_TEST ${error instanceof Error ? error.message : String(error)}`); throw error; } finally { await browser.close(); }
