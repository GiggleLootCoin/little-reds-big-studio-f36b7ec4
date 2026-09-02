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
  "-y",
  "-v",
  "error",
  "-i",
  sourcePath,
  "-t",
  "10",
  "-ac",
  "1",
  "-ar",
  "24000",
  "-c:a",
  "pcm_s16le",
  samplePath,
]);
const sampleBytes = await readFile(samplePath);
const audioBase64 = sampleBytes.toString("base64");
const referenceId = createHash("sha256").update(sampleBytes).digest("hex");

const sttResponse = await fetch(`${base}/api/ai/speech-to-text?android_smoke=1&ts=${Date.now()}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ audioBase64, language: "en" }),
});
if (!sttResponse.ok) {
  const detail = await sttResponse.text().catch(() => "");
  throw new Error(`production STT returned HTTP ${sttResponse.status}: ${detail.slice(0, 300)}`);
}
const stt = await sttResponse.json();
const refText = String(stt.text || stt.transcription || "").trim();
if (!refText) throw new Error("production STT returned no transcript for the Red reference");

async function cloneRequest(extra = {}) {
  return fetch(`${base}/api/voice-clone?android_smoke=1&ts=${Date.now()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      referenceId,
      audioBase64,
      audioType: "audio/wav",
      text: "Hello. This is the live Android browser playback test.",
      language: "en",
      modelSize: "0.6B",
      ...extra,
    }),
  });
}

function assertQwenResponse(response, label) {
  const provider = response.headers.get("x-clone-provider") || "";
  const route = response.headers.get("x-red-voice-route") || "";
  if (!/^Qwen3-TTS Base (0\.6B|1\.7B) reference clone$/i.test(provider)) {
    throw new Error(`${label} used unexpected clone provider: ${provider || "missing"}`);
  }
  if (route !== "qwen3-reference-clone") {
    throw new Error(`${label} used unexpected voice route: ${route || "missing"}`);
  }
}

// Explicit transcript path: verifies the high-quality Qwen reference-conditioned route.
const productionResponse = await cloneRequest({ refText });
if (!productionResponse.ok) {
  const detail = await productionResponse.text().catch(() => "");
  throw new Error(
    `production transcript clone returned HTTP ${productionResponse.status}: ${detail.slice(0, 300)}`,
  );
}
assertQwenResponse(productionResponse, "production transcript clone");
const contentType = productionResponse.headers.get("content-type") || "";
if (
  !/^audio\/(wav|wave)(?:;|$)/i.test(contentType) &&
  !/^application\/octet-stream(?:;|$)/i.test(contentType)
)
  throw new Error(`unexpected production transcript-clone MIME: ${contentType}`);
const productionBytes = Buffer.from(await productionResponse.arrayBuffer());
if (productionBytes.byteLength <= 4096)
  throw new Error(
    `returned transcript-clone audio is too small: ${productionBytes.byteLength} bytes`,
  );

// Default Buddy/Red path: deliberately omit refText so the exact no-transcript path used by the app is exercised.
const defaultResponse = await cloneRequest({});
if (!defaultResponse.ok) {
  const detail = await defaultResponse.text().catch(() => "");
  throw new Error(
    `production default Red clone returned HTTP ${defaultResponse.status}: ${detail.slice(0, 300)}`,
  );
}
assertQwenResponse(defaultResponse, "production default Red clone");
const defaultContentType = defaultResponse.headers.get("content-type") || "";
if (
  !/^audio\/(wav|wave)(?:;|$)/i.test(defaultContentType) &&
  !/^application\/octet-stream(?:;|$)/i.test(defaultContentType)
)
  throw new Error(`unexpected production default-Red MIME: ${defaultContentType}`);
const defaultBytes = Buffer.from(await defaultResponse.arrayBuffer());
if (defaultBytes.byteLength <= 4096)
  throw new Error(`returned default-Red audio is too small: ${defaultBytes.byteLength} bytes`);

if (createHash("sha256").update(defaultBytes).digest("hex") === referenceId) {
  throw new Error(
    "default Red clone returned the reference audio unchanged instead of generated speech",
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
let context;
try {
  context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(window, "__buddyPlayCalls", { value: [], writable: false });
    HTMLMediaElement.prototype.play = function (...args) {
      const promise = originalPlay.apply(this, args);
      window.__buddyPlayCalls.push(
        promise
          .then(() => ({ ok: true, duration: this.duration, paused: this.paused }))
          .catch((error) => ({
            ok: false,
            name: error?.name || "Error",
            message: error?.message || String(error),
          })),
      );
      return promise;
    };
  });
  await page.goto(`${base}/?android_smoke=1`, { waitUntil: "networkidle", timeout: 60000 });
  const playback = await page.evaluate(
    async ({ productionBytes, contentType }) => {
      const bytes = Uint8Array.from(productionBytes);
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      try {
        const audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(bytes.buffer.slice(0));
        let peak = 0,
          sumSquares = 0,
          count = 0;
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
        if (!(decoded.duration > 0.25))
          throw new Error(`decoded duration unusable: ${decoded.duration}`);
        if (!(peak >= 0.005 && rms >= 0.0005))
          throw new Error(`decoded audio is silent: peak=${peak}, rms=${rms}`);
        const audio = new Audio(url);
        audio.preload = "auto";
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("HTMLAudioElement metadata timeout")),
            10000,
          );
          audio.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve();
          };
          audio.onerror = () => {
            clearTimeout(timer);
            reject(new Error("HTMLAudioElement could not decode production Blob URL"));
          };
          audio.load();
        });
        if (!(audio.duration > 0.25))
          throw new Error(`HTMLAudioElement duration unusable: ${audio.duration}`);
        await audio.play();
        if (audio.paused)
          throw new Error("HTMLAudioElement.play() resolved but playback remained paused");
        const calls = await Promise.all(window.__buddyPlayCalls || []);
        audioContext.close();
        return {
          contentType,
          bytes: bytes.byteLength,
          duration: decoded.duration,
          peak,
          rms,
          htmlAudioDuration: audio.duration,
          readyState: audio.readyState,
          paused: audio.paused,
          playCalls: calls,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { productionBytes: [...defaultBytes], contentType: defaultContentType },
  );
  console.log(
    JSON.stringify(
      {
        status: "ok",
        referenceTranscript: refText,
        transcriptCloneBytes: productionBytes.byteLength,
        transcriptCloneProvider: productionResponse.headers.get("x-clone-provider"),
        defaultRedCloneBytes: defaultBytes.byteLength,
        defaultRedProvider: defaultResponse.headers.get("x-clone-provider"),
        androidPlayback: playback,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `::error::ANDROID_BROWSER_VOICE_TEST ${error instanceof Error ? error.message : String(error)}`,
  );
  throw error;
} finally {
  if (context) await context.close();
  await browser.close();
}
