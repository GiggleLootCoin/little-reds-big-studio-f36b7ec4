import { chromium } from "playwright";
import { writeFile, readFile } from "node:fs/promises";
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

const form = new FormData();
form.append("audio", new Blob([sampleBytes], { type: "audio/wav" }), "voice-reference.wav");
form.append("text", "Hello. This is the live Android browser playback test.");
form.append("target_text", "Hello. This is the live Android browser playback test.");
const productionResponse = await fetch(
  `${base}/api/ai/voice-clone?android_smoke=1&ts=${Date.now()}`,
  { method: "POST", body: form },
);
if (!productionResponse.ok)
  throw new Error(`production clone returned HTTP ${productionResponse.status}`);
const contentType = productionResponse.headers.get("content-type") || "";
const cors = productionResponse.headers.get("access-control-allow-origin") || "";
if (!/^audio\/wav(?:;|$)/i.test(contentType))
  throw new Error(`unexpected production MIME: ${contentType}`);
if (cors !== "*") throw new Error(`CORS header missing for browser audio: ${cors || "<empty>"}`);
const productionBytes = Buffer.from(await productionResponse.arrayBuffer());
if (productionBytes.byteLength <= 4096)
  throw new Error(`returned audio is too small: ${productionBytes.byteLength} bytes`);

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const context = await browser.newContext({
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
    async ({ productionBytes, contentType, cors }) => {
      const bytes = Uint8Array.from(productionBytes);
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      try {
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
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
        return {
          contentType,
          cors,
          bytes: bytes.byteLength,
          blobType: blob.type,
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
    { productionBytes: [...productionBytes], contentType, cors },
  );
  console.log(JSON.stringify({ status: "ok", androidPlayback: playback }, null, 2));
  await context.close();
} catch (error) {
  console.error(
    `::error::ANDROID_BROWSER_VOICE_TEST ${error instanceof Error ? error.message : String(error)}`,
  );
  throw error;
} finally {
  await browser.close();
}
