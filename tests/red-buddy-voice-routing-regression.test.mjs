import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chat = await readFile("src/components/studio/BuddyLiveChat.tsx", "utf8");

test("Buddy Red voice path excludes generic Chatterbox providers", () => {
  assert.match(chat, /_skipProviders\s*:\s*\[[^\]]*hf-chatterbox[^\]]*hf-chatterbox-v3[^\]]*\]/);
});
