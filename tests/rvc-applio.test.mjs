import test from "node:test";
import assert from "node:assert/strict";
import {
  buildApplioFormData,
  normalizeApplioUrl,
  validateApplioResponse,
} from "../src/lib/media/rvc-applio.ts";

test("normalizes a configured Applio URL without changing its origin", () => {
  assert.equal(
    normalizeApplioUrl("https://rvc.example.com///"),
    "https://rvc.example.com",
  );
  assert.throws(() => normalizeApplioUrl("not-a-url"), /HTTP URL/);
});

test("builds a complete non-destructive Applio conversion request", async () => {
  const form = buildApplioFormData({
    audio: new File([new Uint8Array([1, 2, 3])], "vocals.wav", {
      type: "audio/wav",
    }),
    model: "red.pth",
    index: "red.index",
    pitch: 0,
    indexRate: 0.75,
    protect: 0.5,
    f0Method: "rmvpe",
    autotune: false,
  });

  assert.equal(form.get("model"), "red.pth");
  assert.equal(form.get("index"), "red.index");
  assert.equal(form.get("pitch"), "0");
  assert.equal(form.get("index_rate"), "0.75");
  assert.equal(form.get("protect"), "0.5");
  assert.equal(form.get("f0_method"), "rmvpe");
  assert.equal(form.get("autotune"), "false");
  assert.equal(form.get("audio")?.name, "vocals.wav");
});

test("accepts only a real audio response with a non-empty body", async () => {
  const good = new Response(new Uint8Array(1000), {
    headers: { "content-type": "audio/wav" },
  });
  assert.equal(await validateApplioResponse(good), true);

  const badType = new Response(new Uint8Array(1000), {
    headers: { "content-type": "text/html" },
  });
  assert.equal(await validateApplioResponse(badType), false);

  const empty = new Response(new Uint8Array(), {
    headers: { "content-type": "audio/wav" },
  });
  assert.equal(await validateApplioResponse(empty), false);
});
