import assert from "node:assert/strict";
import { buddyModelCatalog, hasVisionInput, selectBuddyModel } from "../src/lib/buddy-model-router.mjs";

assert.equal(buddyModelCatalog().length, 5);
assert.equal(selectBuddyModel({ prompt: "Hello Buddy" }).id, "llama-3.2-1b");
assert.equal(selectBuddyModel({ prompt: "Help me understand this code and debug the API" }).id, "qwen3");
assert.equal(selectBuddyModel({ prompt: "Analyze deeply the tradeoffs and derive the best architecture" }).id, "gpt-oss-20b");
assert.equal(selectBuddyModel({ prompt: "What is in this image?", image: "data:image/png;base64,x" }).id, "qwen3-vision");
assert.equal(selectBuddyModel({ prompt: "Hello", model: "reasoning" }).id, "gpt-oss-20b");
assert.equal(hasVisionInput({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "x" } }] }] }), true);
assert.equal(hasVisionInput({ messages: [{ role: "user", content: "hello" }] }), false);
console.log("Buddy model router tests passed");
