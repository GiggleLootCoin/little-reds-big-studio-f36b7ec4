# Little Red's Big Studio — Full Production Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect and verify the Studio's promised Buddy, media-generation, project, Android, and entitlement workflows so every visible capability is real or explicitly unavailable.

**Architecture:** Keep Buddy as the capability orchestrator and preserve the existing free/open runner abstraction. Strengthen each capability around verified artifact contracts, then connect project persistence/export and Android acceptance tests around those contracts.

**Tech Stack:** React 19, TanStack Start, TypeScript, Cloudflare Workers, Supabase, @gradio/client, browser MediaRecorder/Canvas/Web Audio, GitHub Actions, Android TWA.

**Spec:** `docs/superpowers/specs/2026-09-15-studio-production-completion-design.md`

## Global Constraints

- Do not touch Lovable.
- Free/open routes first; no mandatory paid AI provider.
- Never report a job ID, placeholder, demo URL, or unverified artifact as success.
- Preserve the verified preset-preview playback-only behavior.
- Preserve the known-good Red voice reference route unless a test proves it is broken.
- Heavy media inference stays off the Samsung Galaxy A12.
- Never commit secrets.
- Every task ends with a focused test/verification cycle.

---

### Task 1: Establish the capability/artifact contract

**Files:**
- Modify: `src/lib/studio-runtime-impl.ts`
- Modify: `src/lib/studio-runtime.ts`
- Modify: `src/lib/audio-artifact.ts`
- Modify: `src/lib/media.ts`
- Test: `tests/create-flow-contract.test.mjs`
- Test: `tests/audio-artifact.test.ts`

**Interfaces:**
- Produces a single verified-artifact shape for generated audio/image/video outputs.
- Produces explicit failure when an output cannot be decoded/validated.

- [ ] Write failing tests for required artifact validation and rejection of URL-only/unverified success.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement the smallest validation/persistence contract.
- [ ] Run focused tests and confirm pass.
- [ ] Commit.

### Task 2: Finish full-song generation and artwork generation

**Files:**
- Modify: `src/lib/studio-runtime-impl.ts`
- Modify: `src/lib/free-runners.ts`
- Modify: `src/lib/media/free-open-engines.ts`
- Test: new focused media-generation contract test under `tests/`

- [ ] Add failing tests for real song/image artifact requirements.
- [ ] Verify current live runner schemas and actual returned artifact shapes.
- [ ] Fix parameter mapping and output extraction where needed.
- [ ] Ensure duration/lyrics metadata survive the request.
- [ ] Validate decoded audio and image outputs before success.
- [ ] Run focused tests.
- [ ] Commit.

### Task 3: Complete stem separation and authorized singing voice conversion

**Files:**
- Modify: `src/lib/media/rvc-applio.ts`
- Modify: `src/lib/studio-runtime-impl.ts`
- Modify: `src/lib/free-runners.ts` only if live route changes require it
- Test: `tests/rvc-applio.test.mjs`
- Test: `tests/rvc-applio-live-contract.test.mjs`
- Test: new stem/reconstruction contract test if required

- [ ] Write failing tests for validated vocal/instrumental pair, authorization requirement, and final timing.
- [ ] Inspect live Applio/SVC schemas rather than guessing endpoint arguments.
- [ ] Implement exact live parameter mapping.
- [ ] Validate both stems and converted vocal before reconstruction.
- [ ] Reconstruct a non-silent final mix without modifying the original source.
- [ ] Run focused tests and a short real media smoke where provider capacity permits.
- [ ] Commit.

### Task 4: Make the full-song music-video pipeline the canonical package path

**Files:**
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Modify: `src/lib/media/full-music-video.ts`
- Modify: `src/lib/media/music-video-pipeline.ts`
- Modify: `src/lib/studio-runtime-impl.ts` only if capability dispatch must expose full-song video
- Test: `tests/music-video-pipeline.test.mjs`
- Test: `tests/music-video-av-validation.test.mjs`
- Test: new package-flow contract test

- [ ] Write a failing test proving a finished song uses its real duration rather than the short-video UI duration.
- [ ] Run it and confirm failure.
- [ ] Make `song -> artwork -> full music video` the canonical package flow.
- [ ] Keep short video generation available as a separate capability.
- [ ] Verify live video Space endpoints and output extraction; update stale endpoint assumptions only when verified.
- [ ] Ensure exact finished-song audio is used in final rendering.
- [ ] Validate video stream, audio stream, duration, byte size and browser decode.
- [ ] Add retry/fallback only between verified engines.
- [ ] Run focused tests.
- [ ] Commit.

### Task 5: Make generated artifacts durable and exportable

**Files:**
- Modify: `src/lib/media.ts`
- Modify: `src/lib/local-first/projects.ts`
- Modify: `src/lib/studio-store.ts`
- Modify: `src/components/studio/CreatorExportButton.tsx`
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Test: new project-artifact persistence test

- [ ] Write failing tests showing a generated artifact remains usable after component state changes and can be exported.
- [ ] Implement browser-first durable references for supported media and account-backed persistence where promised.
- [ ] Prevent object URLs from being mistaken for permanent storage URLs.
- [ ] Add creation history/project attachment metadata.
- [ ] Run focused tests.
- [ ] Commit.

### Task 6: Finish Buddy multimodal attachments and real awareness boundaries

**Files:**
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/lib/buddy-attachments.ts`
- Modify: `src/lib/buddy-agent.ts`
- Modify: `src/lib/studio-runtime.ts`
- Test: `tests/buddy-experience-contract.test.mjs`
- Test: new attachment/camera/screen capability contract tests

- [ ] Write failing tests for attachment propagation and explicit unsupported camera/screen states.
- [ ] Ensure image attachments actually reach the reasoning route, not only local message metadata.
- [ ] Add real permissioned camera capture if a supported route exists; otherwise remove/disable any implied control.
- [ ] Add screen-awareness only through an actual supported browser/Android mechanism with explicit permission.
- [ ] Ensure privacy copy matches the real path.
- [ ] Run focused tests.
- [ ] Commit.

### Task 7: Finish hands-free voice and wake behavior

**Files:**
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/lib/microphone.ts`
- Modify: `src/lib/speech/buddy-voice-engine.ts`
- Modify: `src/lib/buddy-preset-voice-routing.ts` only if integration tests require it
- Test: `tests/live-voice-browser-smoke.test.mjs`
- Test: `tests/live-buddy-latency.test.mjs`

- [ ] Write failing tests for spoken response completion and wake-state transitions.
- [ ] Keep preset previews playback-only.
- [ ] Verify selected Red clone is used for Buddy speech.
- [ ] Implement wake phrase only where the platform genuinely supports the required behavior; otherwise provide a truthful hands-free fallback.
- [ ] Run browser smoke and Android-oriented validation.
- [ ] Commit.

### Task 8: Audit agentic memory, web lookup, and project context

**Files:**
- Modify only files proven deficient by tests.
- Test: existing cognitive, memory, web-search and orchestrator tests.

- [ ] Add failing integration tests for memory separation, web lookup selection, and creative-project context where gaps exist.
- [ ] Fix only real integration gaps.
- [ ] Confirm Buddy never fabricates memory or exposes development/provider memory as user memory.
- [ ] Run all Buddy contract tests.
- [ ] Commit.

### Task 9: Enforce entitlement/privacy boundaries across creation capabilities

**Files:**
- Modify: `src/hooks/use-entitlement.ts` if required
- Modify: server entitlement/runtime code only where tests prove a gap
- Modify: relevant Supabase migration/functions only where required
- Test: `tests/account-trial-policy.test.mjs`
- Test: `tests/entitlement-copy.test.mjs`

- [ ] Write failing tests for consistent free/trial/member behavior across chat and media creation.
- [ ] Fix server-authoritative checks and user-facing copy.
- [ ] Verify no client-only entitlement bypass exists for generation routes.
- [ ] Run focused tests.
- [ ] Commit.

### Task 10: Android/TWA production verification and cleanup

**Files:**
- Modify only proven-deficient Android/workflow files.
- Verify: `.github/workflows/build-apk.yml`
- Verify: `.github/workflows/deploy-cloudflare.yml`
- Verify: `twa/twa-manifest.json`

- [ ] Run repository test suite, typecheck and lint.
- [ ] Run existing voice, cognitive, memory, web-search, RVC and music-video tests.
- [ ] Build the production web bundle.
- [ ] Deploy only after all static gates pass.
- [ ] Run live production smoke for chat, voice, lyrics, music, image, short video, full music video, and voice conversion using non-sensitive test media.
- [ ] Build a fresh APK from the verified final commit.
- [ ] Validate APK artifact and SHA-256.
- [ ] Record exactly which external providers were live/available during verification.
- [ ] Commit only final documentation/verification changes.

### Task 11: Final product-truth audit

- [ ] Inspect every visible create/control button against an executable route.
- [ ] Remove or clearly disable anything that cannot be honestly supported.
- [ ] Confirm no fake success states, dead buttons, stale provider names, or demo-only links remain.
- [ ] Review final diff for protected-boundary violations.
- [ ] Run the verification-before-completion checklist before claiming completion.
- [ ] Open a PR from `feat/studio-production-completion` to `main`.
