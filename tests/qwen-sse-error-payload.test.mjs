import test from "node:test";
import assert from "node:assert/strict";
import { parseQwenSSE } from "../src/lib/voice-clone-gateway.ts";

test("Qwen complete frame with null audio exposes the returned status error", () => {
  const stream = [
    "event: complete",
    'data: [null, "Error: CUDA out of memory"]',
    "",
  ].join("\n");

  assert.deepEqual(parseQwenSSE(stream), {
    kind: "error",
    message: "Error: CUDA out of memory",
  });
});
