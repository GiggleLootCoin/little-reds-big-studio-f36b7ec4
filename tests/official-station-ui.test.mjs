import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile("src/components/studio/OfficialStationPanel.tsx", "utf8");
const route = await readFile("src/routes/station.$handle.tsx", "utf8");

test("owner station UI exposes profile and publishing controls", () => {
  assert.match(panel, /Official Station/);
  assert.match(panel, /Publish/);
  assert.match(panel, /Station name/);
  assert.match(panel, /handle/i);
});

test("public station route renders creator identity and published work", () => {
  assert.match(route, /getPublicStation/);
  assert.match(route, /station/i);
  assert.match(route, /published/i);
});
