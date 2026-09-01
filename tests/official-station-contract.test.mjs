import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("profile contract exposes public creator identity fields", async () => {
  const source = await read("src/lib/supabase-rest.ts");
  for (const field of ["handle", "bio", "banner_url", "website_url", "station_name", "is_public"]) {
    assert.match(source, new RegExp(field));
  }
});

test("station contract has typed read and publish operations", async () => {
  const source = await read("src/lib/supabase-rest.ts");
  assert.match(source, /StationItem/);
  assert.match(source, /getPublicStation/);
  assert.match(source, /getMyStationItems/);
  assert.match(source, /publishStationItem/);
  assert.match(source, /deleteStationItem/);
});

test("database migration defines station items and row-level security", async () => {
  const source = await read("supabase/migrations/20260902000000_official_station.sql");
  assert.match(source, /create table.*station_items/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /published_at/i);
  assert.match(source, /visibility/i);
});
