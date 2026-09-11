# Qwen Local/Offline Buddy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qwen the primary Buddy reasoning engine with a local/offline OpenAI-compatible path on Android, while preserving the existing online fallback chain and Red voice pipeline.

**Architecture:** Buddy first attempts a local Qwen endpoint exposed on the Android device (configurable and disabled safely when unavailable), then uses the existing server-side Qwen route and current free fallbacks. The local adapter accepts the standard `/v1/chat/completions` shape so it can work with an Android/Termux Qwen-compatible server without embedding a large model in the APK; no credentials are required for the local route. Voice remains a separate artifact-producing pipeline, with Red's verified voice path preserved.

**Tech Stack:** TanStack Start/Vite, TypeScript, React, Cloudflare Workers, Android TWA, Termux/local Qwen OpenAI-compatible HTTP server.

**Spec:** In-chat approved architecture from 2026-09-11: Qwen as Buddy's primary brain, local/offline Android path, existing online path retained, Red voice preserved, end-to-end request→reasoning→response→voice, no Lovable changes.

## Global Constraints

- Real working product, not a visual demo.
- Android/mobile-first; do not assume a computer.
- Prefer free/open solutions and avoid mandatory paid AI APIs/provider accounts.
- Do not touch Lovable.
- Do not modify the protected Pocket TTS environment.
- Do not claim local/offline operation unless a real local endpoint returns a valid response.
- Preserve existing production voice routing and artifact validation.
- Never force-push or modify `main` directly; work on this feature branch and use a PR.

---

### Task 1: Add the local Qwen runtime adapter

**Files:**
- Create: `src/lib/local-qwen.ts`
- Test: `tests/local-qwen.test.mjs`

**Interfaces:**
- Consumes: prompt/messages, optional model, optional timeout, local endpoint configuration.
- Produces: `{ text: string; provider: string }` or a typed failure that lets the caller fall through to online routes.

- [ ] Write tests for URL normalization, disabled/default behavior, valid OpenAI-compatible response extraction, empty response rejection, and timeout/failure signaling.
- [ ] Run the focused Node test and verify it fails before implementation.
- [ ] Implement a small browser-safe adapter using a configurable local endpoint, defaulting to a loopback OpenAI-compatible `/v1/chat/completions` URL only when explicitly enabled.
- [ ] Keep the adapter free of API keys and provider-specific SDK dependencies.
- [ ] Run the focused test until it passes.
- [ ] Commit the adapter and tests.

### Task 2: Make Buddy chat prefer local Qwen, then preserve the existing online chain

**Files:**
- Modify: `src/lib/studio-runtime.ts`
- Modify: `src/lib/free-runners.ts` only if current provider ordering requires a minimal Qwen priority correction.
- Test: existing relevant chat contract test or a new focused test.

**Interfaces:**
- Consumes: existing `runStudioJob("chat", ...)` inputs and Buddy memory/context.
- Produces: the same `StudioArtifact` contract consumed by Buddy Live Chat and other UI paths.

- [ ] Add a regression test proving local Qwen is attempted before remote chat when enabled.
- [ ] Run the focused test and verify the new assertion fails.
- [ ] Route chat through local Qwen first; on local connection, CORS, timeout, malformed-response, or unavailable-endpoint failure, continue to the existing server-side Qwen/fallback chain.
- [ ] Preserve memory injection and `buildAgentSystemPrompt()` behavior.
- [ ] Keep user-facing provider copy generic unless diagnostics are explicitly requested.
- [ ] Run focused chat tests.
- [ ] Commit the integration.

### Task 3: Add Android/Termux local-Qwen setup documentation without hard-coding an unverified model path

**Files:**
- Create: `docs/android-local-qwen.md`
- Create: `scripts/local-qwen-healthcheck.mjs`

**Interfaces:**
- Consumes: a user-selected local Qwen OpenAI-compatible endpoint.
- Produces: a simple health/compatibility check and exact environment-variable configuration instructions.

- [ ] Document that the model remains on-device and the web app only talks to localhost; no cloud account is required for the local path.
- [ ] Make the endpoint configurable rather than guessing a Hermes port or model path that has not been verified in the repository.
- [ ] Provide a healthcheck for `/v1/models` when available and `/v1/chat/completions` with a tiny prompt.
- [ ] Make failures actionable without treating a missing local server as a production error; the app continues to online free routes.
- [ ] Run the script's syntax/logic checks.
- [ ] Commit documentation and healthcheck.

### Task 4: Verify production contracts and create the PR

**Files:**
- Modify: `.studio-memory/CURRENT-STATE.md` with exact evidence only after checks run.
- Modify: `.studio-memory/CHANGELOG.md` with the completed change.

- [ ] Run typecheck.
- [ ] Run lint.
- [ ] Run focused Qwen/local-chat tests.
- [ ] Run existing voice/browser validation tests so the Qwen brain change does not regress Red voice.
- [ ] Run the production build.
- [ ] Inspect the resulting diff for Lovable/Pocket TTS/protected-path changes.
- [ ] Update engineering memory with exact commit/test evidence.
- [ ] Push the feature branch.
- [ ] Open a PR against `main`; do not merge automatically.
- [ ] Report exactly what is verified versus what still requires a real Android offline smoke test.
