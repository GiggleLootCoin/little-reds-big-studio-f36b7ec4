# Little Red's Big Studio — Studio Reliability and Free Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Buddy-first Studio foundations into a reliably testable Android-first creative runtime using only genuinely free/open execution, persistent user memory independent of model choice, automatic model routing, and the newly uploaded Buddy/voice references.

**Architecture:** Preserve the existing provider abstraction and Cloudflare production authority. Add/repair a capability router that scores only free candidates by task fit and runtime health, keep Buddy memory account/project-scoped and model-independent, and make Buddy visual/voice references first-class project assets without exposing provider machinery to normal users. Existing Pocket TTS remains frozen and untouched.

**Tech Stack:** TanStack Start, Vite, TypeScript, Cloudflare Workers, Supabase, Hugging Face public/open routes, existing Buddy orchestration and artifact-validation code.

**Spec:** `.studio-memory/MASTER-SPEC.md`, `.studio-memory/DECISIONS.md`, `.studio-memory/PROVIDERS.md`, `.studio-memory/CURRENT-STATE.md`

## Global Constraints

- Real working product, not a visual demo.
- Android/mobile-first; do not assume a computer.
- Free/open execution is mandatory for AI generation; no mandatory paid AI API/provider account.
- Provider/model machinery remains backstage unless an advanced user explicitly chooses a free backend.
- A route is not verified merely because it exists in metadata; require compatible schema, execution, returned artifact and validation.
- Persistent Buddy/user memory is separate from engineering memory and independent of the selected model.
- Buddy visual references and user-authorized voice references are reusable project assets.
- Do not modify the frozen Pocket TTS environment or its approved direct baseline.
- Never claim generation success without a validated artifact.
- Do not rewrite published git history; keep connected Lovable history intact.

---

### Task 1: Audit the existing runtime and route seams

**Files:**

- Inspect `.studio-memory/*`
- Inspect `src/lib/buddy-orchestrator.ts`, `src/lib/buddy-knowledge.ts`, `src/lib/buddy-presence.ts`, `src/lib/buddy-attachments.ts`
- Inspect provider/runtime routes, artifact validation, and existing tests

**Deliverable:** A concrete map of current working seams, broken seams, and the smallest safe edits required. No speculative replacement of existing infrastructure.

- [ ] Read authoritative engineering memory and recent commits.
- [ ] Locate automatic routing, provider registry, artifact validation, memory, Buddy references, voice routes and tests.
- [ ] Record any mismatch between declared routes and executable routes.
- [ ] Preserve the frozen Pocket TTS boundary.

### Task 2: Make free-only capability routing explicit and health-aware

**Files:**

- Modify the existing routing/provider registry files identified in Task 1.
- Add focused router tests beside existing test conventions.

**Interfaces:**

- Candidate route metadata must include capability, free eligibility, input requirements, runtime health and fallback priority.
- Router returns the best currently eligible route without exposing vendor details to ordinary users.

- [ ] Write failing tests for paid/ineligible candidates being excluded.
- [ ] Write failing tests for unavailable/schema-failing candidates falling through to the next eligible route.
- [ ] Implement the minimal health-aware free-only selection logic.
- [ ] Verify router tests and existing route tests.

### Task 3: Make Buddy memory model-independent

**Files:**

- Modify existing Buddy knowledge/orchestration and account/project memory integration.
- Add focused persistence/routing tests.

**Interfaces:**

- `getBuddyContext(accountId, projectId)` supplies user/project memory before model selection.
- Model selection consumes context but never owns it.
- New durable user facts are written to account/project memory, not provider-specific conversation state.

- [ ] Write failing tests proving context survives model changes.
- [ ] Implement the smallest adapter over the existing persistent storage.
- [ ] Verify separation from `.studio-memory/` engineering files.

### Task 4: Register Buddy visual/video and authorized voice references

**Files:**

- Modify existing Buddy attachment/reference handling.
- Add metadata for the two uploaded Buddy MP4s and existing voice samples where safe.
- Update reference-resolution tests/docs.

**Interfaces:**

- Buddy reference resolver returns appropriate visual references for image/video jobs and authorized voice references for voice jobs.
- Reference assets are source material, not the generated output itself.

- [ ] Write failing tests for reference classification and job-specific selection.
- [ ] Add the two Buddy MP4s as canonical visual reference candidates.
- [ ] Keep speaking/singing voice samples classified separately.
- [ ] Verify no paid provider is required merely to store or resolve references.

### Task 5: Repair the user-facing failure/recovery path

**Files:**

- Modify existing generation UI/runtime status handling only where current tests show gaps.
- Add tests for honest failure states and fallback messaging.

- [ ] Write failing tests for placeholder/job-id-only responses being rejected as success.
- [ ] Implement recovery/fallback status handling.
- [ ] Verify mobile-friendly status text contains no unnecessary provider jargon.

### Task 6: Verify production and Android gates

**Files:**

- `.github/workflows/*` only if verification configuration itself is broken.
- `.studio-memory/CURRENT-STATE.md`, `KNOWN-ISSUES.md`, `CHANGELOG.md` for evidence updates.

- [ ] Run the full available CI checks.
- [ ] Verify the deployed commit before calling production current.
- [ ] Perform available production smoke checks.
- [ ] Record remaining Android/device-level checks honestly if they cannot be executed from the available tooling.
- [ ] Record artifact evidence for each provider actually tested.

### Task 7: Whole-system review

- [ ] Review the final diff against MASTER-SPEC and durable decisions.
- [ ] Confirm no paid-only route became mandatory.
- [ ] Confirm Pocket TTS was not modified.
- [ ] Confirm Buddy references remain reusable and provider-agnostic.
- [ ] Confirm no completion claim is made without fresh verification evidence.
