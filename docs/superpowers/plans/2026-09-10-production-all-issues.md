# Production All-Issues Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair and verify the current production stack from Qwen voice through Buddy, media, services, deployment, and Android packaging without changing the approved architecture.

**Architecture:** Keep Qwen3-TTS as the Red voice backend and keep the existing Buddy request/playback architecture. Make targeted, test-first fixes, transplant only compatible AV hardening from PR #65, and use live/CI evidence before promotion.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, Gradio/Qwen3-TTS, React/TWA Android wrapper, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-production-all-issues-design.md`

## Global Constraints

- Do not touch Lovable.
- Do not touch AppDeploy.
- Production Red voice remains Qwen3-TTS, default 0.6B.
- No paid-provider detours or unnecessary failover.
- Preserve protected voice recordings and existing Studio/UI architecture.
- No new isolated microphone-test cycle.
- Do not merge PR #65 wholesale; transplant only verified compatible changes.

---

### Task 1: Qwen3-TTS gateway contract and diagnostics

**Files:**
- Modify: `src/lib/voice-clone-gateway.ts`
- Test: existing/new voice gateway regression tests near `tests/`

**Interfaces:**
- Consumes: Gradio `/gradio_api/call/generate_voice_clone` SSE output.
- Produces: playable WAV/artifact response and actionable safe errors.

- [ ] Write a failing parser test for terminal `complete`/`error` payloads used by the live Qwen Space, including null/error arrays.
- [ ] Run the focused test and verify the intended failure.
- [ ] Implement the minimal SSE/result parsing fix and preserve current WAV conversion.
- [ ] Run focused voice tests and typecheck.
- [ ] Commit the gateway fix.

### Task 2: Red clone live verification

**Files:**
- Modify: only gateway/config files if a concrete live incompatibility is found.
- Test: `tests/buddy-voice-path.test.mjs` and production voice smoke scripts as applicable.

**Interfaces:**
- Consumes: verified Red reference route.
- Produces: successful clone audio with transcript and x-vector-only modes, with 0.6B selected by default.

- [ ] Run the existing voice regression suite.
- [ ] Exercise the live clone route with the production-safe reference flow.
- [ ] Verify returned media type, non-empty bytes, and decodability.
- [ ] Verify queue retry behavior only when upstream reports a retryable queue condition.
- [ ] Record exact remaining upstream limitations if the free ZeroGPU Space is unavailable.

### Task 3: Buddy end-to-end contract

**Files:**
- Inspect/modify actual Buddy request, TTS, playback, memory/context files only where tests expose a concrete defect.
- Test: existing Buddy voice/memory/browser tests plus focused new regression tests.

**Interfaces:**
- Consumes: user text/audio -> AI response.
- Produces: response text -> TTS -> browser/mobile audio playback and preserved context.

- [ ] Add/extend failing tests for response-to-TTS handoff and mobile audio-unlock ordering.
- [ ] Run tests to confirm failure.
- [ ] Implement minimal fixes.
- [ ] Run voice, memory, browser-bundle, and typecheck tests.
- [ ] Verify the actual cognitive/context path rather than only a one-sentence HTTP smoke.

### Task 4: Media AV hardening

**Files:**
- Inspect PR #65 changed files.
- Modify current-main media pipeline files only for changes proven compatible.
- Test: `tests/music-video-av-validation.test.mjs`, `tests/music-video-pipeline.test.mjs`, and related artifact tests.

**Interfaces:**
- Consumes: generated video chunks and final rendered media.
- Produces: playable AV artifacts with validated duration/streams.

- [ ] Compare PR #65 changes against current main.
- [ ] Add/verify failing AV validation tests first.
- [ ] Transplant only compatible hardening.
- [ ] Run focused media tests and full relevant suite.
- [ ] Verify no stale base-branch assumptions remain.

### Task 5: Production service audit

**Files:**
- Inspect authentication, membership/webhook, email lifecycle, localization, and free-agentic validation code/tests.
- Modify only concrete failing paths.

- [ ] Map each service to an existing test or smoke.
- [ ] Add regression tests before fixes.
- [ ] Fix concrete failures without introducing paid dependencies.
- [ ] Run targeted and full validation.

### Task 6: Deployment and Android artifact gate

**Files:**
- Inspect `.github/workflows/deploy-cloudflare.yml` and `.github/workflows/build-apk.yml`.
- Modify workflows only if current evidence identifies a reproducible gap.

- [ ] Verify CI for the exact final commit.
- [ ] Verify Cloudflare deployment points to that commit/configuration.
- [ ] Run live chat and voice smoke tests.
- [ ] Build the signed APK from the verified commit.
- [ ] Inspect artifact metadata and production endpoint configuration.
- [ ] Do not declare completion until verification evidence is present.
