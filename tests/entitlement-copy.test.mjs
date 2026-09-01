import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("entitlement UI clearly states seven-day unlimited trial and ten-dollar paid tier", async () => {
  const source = await readFile("src/components/studio/EntitlementBanner.tsx", "utf8");
  assert.match(source, /7 days unlimited/);
  assert.match(source, /\$10\/month/);
  assert.match(source, /Buy Me a Coffee/);
  assert.match(source, /first successful sign-up\/login/);
});
