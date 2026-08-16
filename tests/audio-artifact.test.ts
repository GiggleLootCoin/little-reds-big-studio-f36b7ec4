import test from "node:test";
import assert from "node:assert/strict";
import { inspectPcm16Wav } from "../src/lib/audio-artifact.ts";

function wavFromSamples(samples: number[], sampleRate = 24000): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

test("rejects a WAV that has duration but is silent", () => {
  const silent = wavFromSamples(new Array(24000).fill(0));
  assert.throws(() => inspectPcm16Wav(silent), /silent/i);
});

test("accepts non-silent PCM16 WAV and reports duration", () => {
  const samples = Array.from({ length: 24000 }, (_, i) => Math.round(Math.sin(i / 20) * 12000));
  const stats = inspectPcm16Wav(wavFromSamples(samples));
  assert.equal(stats.sampleRate, 24000);
  assert.equal(stats.channels, 1);
  assert.equal(stats.duration, 1);
  assert.ok(stats.peak > 0.3);
  assert.ok(stats.rms > 0.1);
});

test("rejects a non-WAV artifact instead of trusting the MIME type", () => {
  assert.throws(() => inspectPcm16Wav(new TextEncoder().encode("not audio")), /RIFF\/WAVE/i);
});
