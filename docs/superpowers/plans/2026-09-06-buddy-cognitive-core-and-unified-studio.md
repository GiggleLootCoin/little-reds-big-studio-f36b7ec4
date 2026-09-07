# Buddy Cognitive Core and Unified Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Buddy the unified, Red-specific creative intelligence and orchestration layer for the Studio, while keeping Red's source material private from end users and preserving the verified production voice checkpoint.

**Architecture:** Keep Red-specific cognitive material behind a server-authoritative/private boundary; expose only derived, task-appropriate context to the reasoning layer. Separate conversation/memory, intent planning, multimodal inputs, creative execution, artifact/version storage, provenance/watermark policy, and entitlement gates so each subsystem is independently testable. Buddy chooses technical execution invisibly and never claims completion without a validated artifact.

**Tech Stack:** Existing React/TypeScript Studio, Supabase/Postgres/Edge Functions, existing Cloudflare Worker, existing `@gradio/client` media integrations where verified, existing Qwen3-TTS production route, existing Buddy modules, browser Web Audio/MediaRecorder APIs, repository CI.

**Spec:** `docs/superpowers/specs/2026-09-06-trial-bmac-email-design.md` plus the approved media/RVC plan `docs/superpowers/plans/2026-09-06-media-rvc-music-video.md` and the canonical Red source `ziAnBw1A (1).txt`.

## Global Constraints

- Never modify `main` directly during implementation.
- Never touch AppDeploy.
- Never modify the Pocket TTS environment.
- Never delete or modify protected voice recordings.
- Preserve the verified Qwen3-TTS production voice route.
- Do not expose provider/model/API/GPU/endpoint implementation details in ordinary Buddy UX.
- Do not copy private cognitive material into browser bundles, public APIs, or user-visible messages.
- Treat Red's Ways Of Thinking as Red-specific cognitive/creative guidance, not as a universal factual database.
- Keep factual/current-information research distinct from Red-specific perspective and creative intent.
- Prefer free/open implementations; no paid dependency may be introduced without explicit approval.
- Every destructive operation must be reversible or require confirmation.
- Preserve originals and use versioned, non-destructive outputs.
- Every creative pipeline must validate real artifacts before claiming success.
- All new behavior uses TDD and evidence-based verification.

---

### Task 1: Establish the private Red Cognitive Core boundary

**Files:**
- Create: `src/lib/buddy-red-cognitive-core.ts`
- Modify: `src/lib/buddy-agent.ts`
- Modify: `src/lib/buddy-knowledge.ts`
- Test: existing Buddy test location discovered from repository

**Interfaces:**
- Produces a `RedCognitiveContext` with creator identity, cognitive priorities, perspective handling, EQ/relationship guidance, creative reasoning guidance, and source version/hash.
- Produces a server-safe context function that does not expose the raw source unless explicitly running in an authorized internal context.

- [ ] Write failing tests for creator identity, source hash/version, perspective-vs-fact separation, and absence of raw-source exposure from the public planner.
- [ ] Implement the minimal cognitive-core types and policy.
- [ ] Make `buildAgentSystemPrompt()` consume the derived core rather than a generic worldview label.
- [ ] Run focused tests and commit.

### Task 2: Make Buddy orchestration outcome-first instead of route-opening

**Files:**
- Modify: `src/lib/buddy-orchestrator.ts`
- Modify: existing runtime dispatch modules discovered during inspection
- Test: focused orchestrator tests

**Interfaces:**
- Consumes natural-language intent plus project context.
- Produces a typed execution plan with dependencies, required inputs, entitlement requirements, reversible/destructive classification, and validation requirements.

- [ ] Write failing tests for multi-step intent such as song -> artwork -> video and vocal separation -> conversion -> reconstruction.
- [ ] Replace `window.open()` route behavior with actual in-app dispatch where a verified runtime exists.
- [ ] Keep unavailable routes explicit internally and never fabricate completion.
- [ ] Run focused tests and commit.

### Task 3: Persistent one-conversation Buddy memory

**Files:**
- Inspect and modify `src/lib/buddy-memory.mjs`, `src/lib/buddy-memory.mjs.d.mts`, existing Supabase memory schema/functions.
- Test exact memory boundary.

**Interfaces:**
- Stores durable conversation/project summaries and asset references, not an unbounded transcript in every request.
- Retrieves relevant context by project, task, asset, and recent conversation.

- [ ] Write failing tests for append, retrieval, compaction, project switching, and persistence across voice/text sessions.
- [ ] Implement bounded context retrieval and durable project state.
- [ ] Ensure sensitive/private data remains protected by server-side authorization.
- [ ] Verify repeated sessions retain useful context without transcript explosion.
- [ ] Commit.

### Task 4: Unified multimodal input layer

**Files:**
- Inspect existing Buddy attachment/voice/presence modules and create focused multimodal adapters as required.
- Test each adapter.

**Interfaces:**
- Normalizes text, microphone turns, camera frames, screen-share frames, image/audio/video uploads, and sound recordings into a common `BuddyInput` envelope.

- [ ] Write failing tests for text, audio, image, video, camera/screen metadata, and recorded sound inputs.
- [ ] Implement permission-aware normalization without leaking provider details.
- [ ] Add safe size/type/duration validation.
- [ ] Commit.

### Task 5: Natural live-voice conversation controller

**Files:**
- Inspect existing `src/lib/buddy-voice-expanded.ts` and related UI/runtime modules.
- Modify only the focused voice session modules.
- Test live-turn state machine.

**Interfaces:**
- Supports listening, speaking, interruption, endpointing, echo protection, and resumed conversation state.

- [ ] Write failing state-machine tests for background noise, short pauses, user speech, Buddy echo, barge-in, and resumed turns.
- [ ] Implement the smallest browser-compatible streaming/session controller available in the existing stack.
- [ ] Preserve continuous conversation context.
- [ ] Verify Android-safe behavior and graceful fallback when a live capability is unavailable.
- [ ] Commit.

### Task 6: Sound-to-music intelligence

**Files:**
- Create focused sound-analysis/planning module under `src/lib/media/`.
- Modify Buddy action capability/dispatch types.
- Test intent classification and pipeline planning.

**Interfaces:**
- Maps humming, singing, beatboxing, tapping, clapping, rain, and environmental recordings into melody/rhythm/instrument/texture/sample workflows.

- [ ] Write failing tests for melodic, percussive, textural, environmental, and ambiguous sound intents.
- [ ] Implement deterministic planning and leave actual heavy generation to verified runtimes.
- [ ] Ensure Buddy can chain sound analysis into music generation and editing.
- [ ] Commit.

### Task 7: Frequency integrity subsystem

**Files:**
- Create focused frequency reference/validation module.
- Integrate with music planning.
- Test exact-frequency behavior.

**Interfaces:**
- Distinguishes tuning reference from explicit frequency content and validates requested targets after rendering when feasible.

- [ ] Write failing tests for 432 Hz and 528 Hz targets, tuning-vs-tone semantics, sampling-rate conversion, and existing-song preservation.
- [ ] Implement verified frequency constants and analysis helpers.
- [ ] Ensure new music defaults to 432 Hz tuning when musically compatible without silently damaging existing material.
- [ ] Commit.

### Task 8: Central watermark and provenance policy

**Files:**
- Create focused export-policy/provenance modules.
- Integrate image/video export paths.
- Test free/paid behavior.

**Interfaces:**
- Produces clean internal masters plus policy-compliant exports; visible watermark defaults on free/trial and is removable for paid users without altering masters.
- Preserves provenance metadata where supported.

- [ ] Write failing tests for watermark placement policy, paid toggle, master preservation, and provenance intent.
- [ ] Implement centralized export policy.
- [ ] Verify every image/video path reaches the policy before export.
- [ ] Commit.

### Task 9: Finish real media/RVC workflows from the existing plan

**Files:**
- Continue the exact files identified in `2026-09-06-media-rvc-music-video.md`.

**Interfaces:**
- Produces validated song, artwork, full-song video, stem-separated audio, RVC voice conversion, and reconstructed final song artifacts.

- [ ] Complete deterministic runtime-contract tests.
- [ ] Verify live runtime contracts before integration; do not guess endpoint parameters.
- [ ] Complete artifact validation at every stage.
- [ ] Run a real short non-sensitive end-to-end smoke.
- [ ] Commit.

### Task 10: Integrate account/entitlement/email work

**Files:**
- Continue `2026-09-06-trial-bmac-email.md` exactly task-by-task.

**Interfaces:**
- Produces first-login trial, paid entitlement, BMAC lifecycle, restrained email, DOB/birthday, and milestone behavior.

- [ ] Complete the existing plan without duplicating infrastructure.
- [ ] Gate paid-only capabilities server-side.
- [ ] Ensure Buddy can explain access limits without exposing implementation details.
- [ ] Commit.

### Task 11: Creator Vault, versioning, recovery, and locks

**Files:**
- Inspect existing project/asset storage modules and create only missing focused persistence modules.
- Test asset/version invariants.

**Interfaces:**
- Every generated asset has immutable source/master references, versions, project linkage, and recoverability.

- [ ] Write failing tests for version creation, undo/revert, locked elements, deletion recovery, and project export.
- [ ] Implement non-destructive versioning and recovery.
- [ ] Prevent Buddy from changing locked elements without explicit user action.
- [ ] Commit.

### Task 12: End-to-end Buddy acceptance suite and final gate

**Files:**
- Test suites only unless a real defect requires source changes.

**Interfaces:**
- Validates the user-visible contract from natural request through actual artifact/result.

- [ ] Run full repository tests.
- [ ] Run typecheck, formatting, lint, Buddy contracts, media contracts, and production voice-route checks.
- [ ] Run real non-sensitive short media smoke tests.
- [ ] Verify no AppDeploy/Pocket-TTS/protected-recording changes.
- [ ] Verify no paid dependency or committed secret.
- [ ] Verify current production main remains unchanged until explicit review.
- [ ] Inspect final diff and PR checks.
- [ ] Only claim completion for capabilities with direct passing evidence; clearly isolate anything externally blocked by a free runtime's availability.
