import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const base = process.env.PRODUCTION_URL;
const sampleUrl = process.env.SAMPLE_URL;
if (!base || !sampleUrl) throw new Error("PRODUCTION_URL and SAMPLE_URL are required");
const sample = await fetch(sampleUrl).then(async (response) => {
  if (!response.ok) throw new Error(`sample download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
});
const samplePath = "/tmp/live-voice-reference.mp3";
await writeFile(samplePath, sample);

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
  const input = page.locator('input[type="file"][accept="audio/*"]');
  await input.setInputFiles(samplePath);
  await page.getByRole("button", { name: "Generate My Voice Clone" }).click();
  await page
    .getByText(/REAL VOICE CLONE VERIFIED|Buddy couldn't create the voice clone yet\./)
    .waitFor({ timeout: 240000 });
  const status = await page.locator("body").innerText();
  if (!/REAL VOICE CLONE VERIFIED/.test(status))
    throw new Error(`Clone did not verify.\n${status}`);
  const playback = await page.evaluate(async () => {
    const calls = await Promise.all(window.__buddyPlayCalls || []);
    const url = window.__buddyLastCloneUrl;
    if (!url) throw new Error("Normalized clone URL was not exposed by the playback path");
    const probe = new Audio(url);
    probe.preload = "metadata";
    await new Promise((resolve, reject) => {
      probe.onloadedmetadata = resolve;
      probe.onerror = () => reject(new Error("HTMLAudioElement could not decode normalized clone"));
      probe.load();
    });
    return { calls, duration: probe.duration, readyState: probe.readyState, paused: probe.paused };
  });
  console.log(JSON.stringify({ status: "ok", playback }, null, 2));
  if (!playback.duration || playback.duration <= 0.25)
    throw new Error("Browser reported unusable duration");
  if (!playback.calls.some((entry) => entry.ok)) {
    throw new Error(
      `No successful HTMLMediaElement.play() call: ${JSON.stringify(playback.calls)}`,
    );
  }
  await context.close();
} finally {
  await browser.close();
}
