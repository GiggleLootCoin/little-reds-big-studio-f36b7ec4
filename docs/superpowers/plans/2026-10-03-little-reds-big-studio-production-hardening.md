# Little Red's Big Studio Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current hardening branch into a verifiably installable, reliable Android build of Little Red's Big Studio with truthful Buddy audio, durable media workflows, provider-independent failure handling, and a persistent release APK.

**Architecture:** Keep the existing React/Vite Studio UI and native Android shell, but put all creator capabilities behind explicit provider-neutral adapters and a single cost/failure policy. Replace fragile browser-only audio assumptions with a native Android playback/recording bridge, while retaining web providers only as optional capability adapters. Build and release through GitHub Actions and verify the actual APK rather than treating a green web build as completion.

**Tech Stack:** TypeScript, React, Vite, existing Android shell, native Android audio APIs, GitHub Actions, existing project test tooling, browser audio validation, GitHub Release assets.

**Spec:** `docs/superpowers/specs/2026-10-03-lrbgs-free-first-production-design.md`

## Global Constraints

- The product is named **Little Red's Big Studio**; do not abbreviate it as LRBGS.
- Do not modify Lovable.
- Do not make Cloudflare, Netlify, Replit, Supabase, Hume, Pollinations, one Hugging Face Space, or any single commercial provider a core dependency.
- $0 Mode must block paid, metered, BYOP/Pollen, and credit-consuming routes.
- Red's cloned voice must never be silently represented by generic Android TTS.
- The Galaxy A12 is the target acceptance device; heavyweight generative models must not be assumed to run locally.
- Work remains isolated from `main` until a verified release candidate exists.
- Do not claim completion from compilation alone.

## Review Focus

- Android audio output succeeds even when the browser audio layer fails; test native playback with a known generated audio artifact.
- A voice request that returns empty/silent/undecodable data becomes a failure, not a fake speaking state; test zero-byte, silent, malformed, and valid audio.
- Provider outage or timeout produces a recoverable unavailable/failed state without changing a job to succeeded; test timeout and HTTP failure.
- $0 Mode cannot select a paid or credit-consuming provider even when its credentials/configuration are present; test each cost class.
- The release APK is a real installable signed package containing the logo and required runtime assets; test package metadata, ZIP integrity, signature, SHA-256, and clean installation.

### Task 1: Establish a Current Release Baseline

**Files:**
- Inspect: `package.json`, Android project files, `src/lib/studio-runtime.ts`, `src/lib/studio-runtime-impl.*`, voice/audio modules, workflows under `.github/workflows/`
- Test: existing project test/typecheck/build commands

**Interfaces:**
- Consumes: current hardening branch.
- Produces: a documented baseline of the exact failing checks, provider routes, Android entry point, APK output path, and existing release workflow.

- [ ] Run typecheck, configured tests, lint, and production build on the branch.
- [ ] Inspect the Android shell and identify the actual WebView/native bridge entry point and current audio message bridge.
- [ ] Inspect every Buddy voice route and every RVC route and record which ones depend on hosted Gradio/Drive/Worker endpoints.
- [ ] Inspect workflow files and current artifact/release behavior.
- [ ] Commit only baseline-independent repairs discovered during this task.

### Task 2: Make Audio Transport Deterministic

**Files:**
- Modify: the existing Android bridge/activity/audio files discovered in Task 1
- Modify: `src/lib/studio-runtime.ts` and the existing browser audio artifact/playback modules
- Test: new focused Buddy audio transport tests

**Interfaces:**
- Consumes: verified `Blob`/audio artifact from the voice engine.
- Produces: a native playback request/result with explicit `started`, `failed`, and error information.

- [ ] Add failing tests for empty audio, invalid audio, valid audio, and playback-start failure.
- [ ] Implement native Android audio playback using a supported Android media API, with completion/error callbacks.
- [ ] Add a narrow WebView bridge message for handing verified audio bytes/file URIs to native playback.
- [ ] Ensure browser playback is not the only transport for Android.
- [ ] Verify Android TTS initialization, engine selection/availability, language support, and synthesis errors; use TTS only as explicitly labeled non-Red emergency fallback. Android's API exposes engine selection and concrete error states including missing language data and synthesis/output errors. citeturn0search0
- [ ] Make the UI say Buddy is speaking only after the native transport confirms playback start.
- [ ] Run focused tests and commit.

### Task 3: Repair the Red Voice Contract

**Files:**
- Modify: `src/lib/studio-runtime.ts`
- Modify: existing voice-clone gateway/voice provider modules
- Test: voice regression tests

**Interfaces:**
- Consumes: Red reference sample/profile and requested text.
- Produces: a verified audio artifact plus provider/verification metadata.

- [ ] Add failing tests proving Red requests never silently downgrade to generic TTS.
- [ ] Centralize Red voice generation behind a `RedVoiceEngine`-compatible adapter.
- [ ] Require non-empty, decodable, non-silent audio before success.
- [ ] Remove or isolate hard dependencies on a single hosted clone endpoint from the core contract.
- [ ] Preserve the stored Red sample/profile and existing authorized voice model; do not alter the user's source recordings.
- [ ] Run voice tests and commit.

### Task 4: Add the $0 Cost/Fallback Policy

**Files:**
- Create/modify: provider-routing and cost-policy modules
- Modify: existing AI/media routing
- Test: cost-policy/provider-routing tests

**Interfaces:**
- Consumes: capability request plus provider metadata.
- Produces: an allowed provider selection or an explicit unavailable result.

- [ ] Add failing tests for paid, metered, BYOP/Pollen, genuinely free, and local routes.
- [ ] Implement a single policy check executed before every provider invocation.
- [ ] Ensure no provider can bypass the policy by being called directly from a UI component.
- [ ] Ensure provider failures fall through only to another provider with the same capability and permitted cost class.
- [ ] Replace misleading success states with queued/running/succeeded/failed/unavailable state transitions.
- [ ] Run routing tests and commit.

### Task 5: Stabilize Core Creator Workflows

**Files:**
- Modify: `src/lib/studio-runtime-impl.*`
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Modify: existing music/video/image/audio workflow modules
- Test: workflow regression tests

**Interfaces:**
- Consumes: provider-neutral capability requests.
- Produces: persisted, verified media artifacts.

- [ ] Add failing tests for successful artifact validation and failed/empty provider output.
- [ ] Ensure each workflow persists MIME type, size, provenance, and validation status.
- [ ] Ensure export/share operates on local verified artifacts rather than transient provider URLs.
- [ ] Keep heavyweight model execution off the Galaxy A12 and make unavailable free compute an explicit state.
- [ ] Harden at least one complete end-to-end creation path so it can produce a playable artifact without requiring paid credits.
- [ ] Run workflow tests and commit.

### Task 6: Restore Branding and Android Persistence

**Files:**
- Modify: Android resources/manifest/shell assets
- Modify: relevant Studio branding components
- Test: Android package/resource inspection

**Interfaces:**
- Consumes: canonical Little Red logo asset already present in the repository.
- Produces: APK containing the correct logo and stable app identity.

- [ ] Verify the canonical dripping-red Little Red's Big Studio logo is the actual source asset.
- [ ] Add failing package/resource checks for logo presence and app label.
- [ ] Restore the logo to splash/header/app icon paths that are currently missing.
- [ ] Verify app label is Little Red's Big Studio.
- [ ] Verify project metadata survives activity/process recreation where the current architecture supports it.
- [ ] Run package/resource checks and commit.

### Task 7: Make the APK Build and Release Persistent

**Files:**
- Modify: `.github/workflows/*.yml`
- Modify: Android Gradle/signing configuration as required
- Create: release verification scripts if absent
- Test: CI workflow and local artifact inspection

**Interfaces:**
- Consumes: production source and signing configuration available to CI.
- Produces: a signed release APK plus SHA-256 and verification metadata attached to a persistent GitHub Release.

- [ ] Add failing verification for APK existence, ZIP integrity, package metadata, signature, SHA-256, and required assets.
- [ ] Make the workflow build a clean release APK.
- [ ] Upload build artifacts for diagnostics; GitHub Actions supports persisted workflow artifacts and artifact provenance. citeturn0search1
- [ ] Publish the verified APK as a persistent GitHub Release asset rather than relying on an expiring workflow-artifact download. GitHub's release-oriented APK actions can attach a built APK directly to a release. citeturn0search2
- [ ] Verify the exact release asset after publication and record its SHA-256.
- [ ] Commit workflow changes.

### Task 8: Full Release Verification

**Files:**
- Modify: only if a verification failure identifies a real defect.
- Test: complete project and Android acceptance suite

**Interfaces:**
- Consumes: release candidate APK.
- Produces: evidence for the real-world acceptance path in the production spec.

- [ ] Run clean install/build verification.
- [ ] Verify launch, logo, Studio UI, Buddy text, native audible playback, Red voice contract, microphone path, project persistence, media creation, export/share, provider failure recovery, and $0 enforcement.
- [ ] Verify the APK is installable and signed and that its SHA-256 matches the published asset.
- [ ] Verify no core runtime dynamically imports fragile production chunks.
- [ ] Verify no prohibited service is required for core operation.
- [ ] Only after all checks pass, publish the final release asset and provide its persistent download link.

## Final Release Gate

The work is not complete when CI merely turns green. Completion requires a verified release APK and evidence for the Galaxy A12 acceptance path in the production spec. If any acceptance item fails, fix it on the isolated branch, rerun the affected verification, and repeat the release gate.
