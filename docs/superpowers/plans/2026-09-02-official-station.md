# Official Station + Creator Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent creator profiles and public Official Stations, with secure publishing and the existing seven-day trial/$10 BMAC entitlement model.

**Architecture:** Extend the existing Supabase profile layer with public creator identity and station-item records. Add a public TanStack route for stations and a mobile-first owner editor/publisher in the Community area. Keep publishing artifact-first and server/RLS controlled.

**Tech Stack:** TanStack Start, React 19, TypeScript, Supabase REST/Postgres/RLS, Tailwind CSS, existing Studio runtime.

**Spec:** `docs/superpowers/specs/2026-09-02-official-station-design.md`

## Global Constraints
- Android/mobile-first.
- Free/open AI execution remains separate from paid membership.
- Seven-day unlimited trial starts on first successful account login; paid tier is $10/month through the existing Buy Me a Coffee membership.
- Entitlements are server-authoritative.
- Never publish a placeholder, job ID, or unvalidated artifact.
- Do not modify the Pocket TTS environment.
- Provider/model machinery stays backstage.

### Task 1: Profile/station schema and REST contract
**Files:**
- Create: `supabase/migrations/20260902000000_official_station.sql`
- Create: `tests/official-station-contract.test.mjs`
- Modify: `src/lib/supabase-rest.ts`

**Interfaces:**
- `ProfileRecord` gains `handle`, `bio`, `banner_url`, `website_url`, `station_name`, `is_public`.
- Add `StationItem` and REST helpers `getPublicStation`, `getMyStationItems`, `publishStationItem`, `updateStationItem`, `deleteStationItem`.

- [ ] Write the failing contract test asserting the new profile fields, station-item table name, public route helpers, and no client-side entitlement override.
- [ ] Run `node --test tests/official-station-contract.test.mjs` and verify failure because the helpers/schema do not yet exist.
- [ ] Add the SQL schema with unique normalized handles, foreign keys, indexes, RLS, and public-read/owner-write policies.
- [ ] Extend `supabase-rest.ts` with typed station/profile helpers.
- [ ] Run the contract test and type-check; commit the schema/REST layer.

### Task 2: Profile editor and Station owner controls
**Files:**
- Modify: `src/components/studio/sections-community.tsx`
- Create: `src/components/studio/OfficialStationPanel.tsx`

**Interfaces:**
- Profile editor saves handle, display name, bio, avatar, banner, website, and station name.
- Station panel lists current items and provides publish/delete controls.

- [ ] Add tests for required owner UI strings and publish contract.
- [ ] Run them red.
- [ ] Implement the mobile-first profile/station controls using existing `Panel`, `StudioButton`, `Note`, and `Readout` components.
- [ ] Ensure unauthenticated users are directed to sign in rather than receiving an owner-write path.
- [ ] Run tests and type-check; commit.

### Task 3: Public Station route
**Files:**
- Create: `src/routes/station.$handle.tsx`
- Modify: `src/routes/sitemap[.]xml.ts`

**Interfaces:**
- `/station/:handle` resolves the public profile and public station items.
- Public profiles with no published work still render a valid station page.
- Private profiles return a non-leaking not-found/private state.

- [ ] Write route contract tests first and verify red.
- [ ] Implement route metadata, creator header, featured item, media grid, and empty state.
- [ ] Add public station URLs to sitemap only when safely enumerable by the server; otherwise document that dynamic station URLs are shared directly.
- [ ] Run type-check/build and route tests; commit.

### Task 4: Buddy publishing integration
**Files:**
- Modify: `src/lib/buddy-agent.ts`
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/lib/studio-runtime.ts`
- Create: `tests/buddy-station-publish.test.mjs`

**Interfaces:**
- Buddy recognizes explicit publish intent and can call `publishStationItem` only with a real artifact URL.
- Buddy confirms publication only after the REST operation succeeds.

- [ ] Write the failing publish-intent test.
- [ ] Verify red.
- [ ] Add a `publish-station` action capability and a guarded client execution path.
- [ ] Ensure Buddy never publishes automatically from generation success without user intent.
- [ ] Run the test, type-check, and existing Buddy regression suite; commit.

### Task 5: Entitlement clarity and BMAC readiness
**Files:**
- Modify: `src/components/studio/EntitlementBanner.tsx`
- Modify: `src/lib/supabase-rest.ts`
- Create/modify only if missing after inspection: existing BMAC webhook handler

**Interfaces:**
- Free trial copy explicitly says `7 days unlimited` and `$10/month after trial`.
- Paid status remains server-authoritative.
- Existing BMAC signed membership webhook remains the source of paid entitlement; no browser-side payment claim is trusted.

- [ ] Add contract assertions for the exact pricing/trial language.
- [ ] Verify red.
- [ ] Implement the clearer tier display and BMAC destination link without changing entitlement authority.
- [ ] Run entitlement tests and type-check; commit.

### Task 6: Full verification and integration
- [ ] Run the full repository validation workflow.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build` locally/through CI where available.
- [ ] Verify the feature branch CI status.
- [ ] Verify the Supabase migration/RLS against the connected project when the project database is available.
- [ ] Verify a real authenticated station read/write path and public station read path before calling the feature production-ready.
