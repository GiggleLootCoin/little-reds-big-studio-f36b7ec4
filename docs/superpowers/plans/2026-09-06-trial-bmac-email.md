# Trial, BMAC, and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seven-day first-login trial, $10/month BMAC membership entitlement, and transactional/optional email lifecycle reliable end-to-end without disturbing the known-good Qwen production voice checkpoint.

**Architecture:** Keep entitlement decisions server-authoritative in Supabase/Postgres. Initialize the trial exactly once through an authenticated server-side operation after the first successful login, expose an authoritative expiry to the UI, and render a live countdown without allowing the client to change the timestamp. Process BMAC lifecycle webhooks with verified HMAC signatures, deterministic account matching, idempotency, and paid-period retention after cancellation/pausing. Send transactional email from a Supabase Edge Function through a server-side provider secret, with separate explicit opt-in preferences for non-transactional updates/holiday/marketing mail.

**Tech Stack:** React/TypeScript frontend, Supabase Auth/Postgres/RLS/Edge Functions, Buy Me a Coffee webhooks, Resend email API, existing repository test/lint/typecheck/build/production-smoke workflows.

**Spec:** `docs/superpowers/specs/2026-09-06-trial-bmac-email-design.md`

## Global Constraints

- Do not touch AppDeploy.
- Do not modify the Pocket TTS environment.
- Do not delete or modify protected voice recordings.
- Do not replace or alter the current Qwen3-TTS production voice route.
- Do not deploy or change `main` until all branch verification gates pass and the resulting PR is explicitly reviewed.
- Do not commit provider secrets, BMAC webhook secrets, or email API keys.
- Trial timing is server-authoritative and starts once, at the first authenticated login/session.
- Existing non-null trial timestamps must be preserved.
- BMAC membership access must remain valid through the paid period end after cancellation/pausing.
- Transactional email failures must never block login, entitlement, or webhook acknowledgement.
- Optional update/holiday/marketing email requires explicit user opt-in and an unsubscribe path.
- All new behavior must follow TDD: failing test first, then minimal implementation, then green verification.

---

### Task 1: Map the Existing Auth, Entitlement, BMAC, Email, and Test Boundaries

**Files:**
- Read-only inspection of the exact current frontend auth/entitlement files, Supabase migrations/functions, package/test configuration, and deployment workflows on `39d0bbae3c277f8e850f7e38b17aca75b04b87a3`.

**Interfaces:**
- Consumes: current repository and Supabase project state.
- Produces: an implementation map identifying the exact existing files/functions/tables to change; no production behavior changes.

- [ ] **Step 1: Locate the authenticated login/session success path and existing entitlement/countdown UI.**

- [ ] **Step 2: Locate the exact `profiles` schema, `trial_started_at` default/trigger/RLS, entitlement RPC, membership tables, and BMAC event table/function.**

- [ ] **Step 3: Locate existing email-related code, preferences, test runner, and Supabase deployment/migration mechanism.**

- [ ] **Step 4: Record only exact paths and existing function signatures in the implementation notes; do not guess paths or create duplicate infrastructure.**

- [ ] **Step 5: Verify this inspection introduces no repository changes.

---

### Task 2: Make First-Login Trial Initialization Atomic and Immutable

**Files:**
- Modify: exact existing Supabase migration/schema files identified in Task 1.
- Modify: exact existing entitlement/auth database function identified in Task 1.
- Modify: exact existing frontend auth/session file identified in Task 1.
- Test: exact existing database/unit test location identified in Task 1.

**Interfaces:**
- Produces: an authenticated server operation that initializes `trial_started_at` only when it is null and returns the authoritative trial end timestamp.
- Produces: frontend login/session flow that invokes the operation after successful authentication and uses its server result.

- [ ] **Step 1: Write a failing test proving a newly created profile has no trial start before first successful authentication.**

- [ ] **Step 2: Write a failing test proving the first authenticated call sets `trial_started_at` exactly once and returns `trial_started_at + interval '7 days'`.**

- [ ] **Step 3: Write a failing test proving repeated calls, logout/login, refresh, and concurrent calls never move the original timestamp.**

- [ ] **Step 4: Run only the new tests and confirm they fail for the intended missing behavior.**

- [ ] **Step 5: Remove the schema default that starts trials at profile creation, if the inspection confirms that default is still present.**

- [ ] **Step 6: Implement the minimal atomic authenticated database operation using a conditional update/row lock so only the first caller can initialize the timestamp.**

- [ ] **Step 7: Wire the existing successful-auth/session path to call that operation exactly once per session bootstrap without changing unrelated auth behavior.**

- [ ] **Step 8: Run the new trial tests and existing auth/entitlement tests; require green results.**

- [ ] **Step 9: Commit the trial change separately with a focused message.**

---

### Task 3: Make Entitlement Precedence and Trial Expiry Server-Authoritative

**Files:**
- Modify: exact existing entitlement SQL/RPC identified in Task 1.
- Test: exact entitlement test location identified in Task 1.

**Interfaces:**
- Consumes: atomic first-login trial timestamp from Task 2.
- Produces: an entitlement result that deterministically prioritizes valid paid membership over trial state and expires the trial at the exact seven-day boundary.

- [ ] **Step 1: Write a failing test for entitlement immediately before the seven-day boundary.**

- [ ] **Step 2: Write a failing test for entitlement exactly at and after the seven-day boundary.**

- [ ] **Step 3: Write a failing test proving an active paid membership grants access even when the trial has expired.**

- [ ] **Step 4: Write a failing test proving cancellation/pausing does not remove access before the stored paid-period end.**

- [ ] **Step 5: Run the focused tests and confirm the failures are caused by current entitlement semantics.**

- [ ] **Step 6: Implement the smallest SQL/RPC change needed to enforce the precedence and exact time comparison.**

- [ ] **Step 7: Run focused and regression entitlement tests.**

- [ ] **Step 8: Commit the entitlement change separately.**

---

### Task 4: Implement the Live Seven-Day Countdown UI

**Files:**
- Modify: exact existing trial/entitlement UI component identified in Task 1.
- Test: exact existing frontend test location identified in Task 1.

**Interfaces:**
- Consumes: authoritative `trial_ends_at`/entitlement data from the server.
- Produces: a live days/hours/minutes/seconds countdown that reaches zero at the server-defined expiry and never writes trial state.

- [ ] **Step 1: Write a failing UI test proving the countdown renders the server-provided remaining duration.**

- [ ] **Step 2: Write a failing test proving the countdown reaches zero and remains expired after the deadline.**

- [ ] **Step 3: Write a failing test proving a page refresh does not restart the countdown.**

- [ ] **Step 4: Run the focused UI tests and confirm they fail for the missing/incorrect behavior.**

- [ ] **Step 5: Implement a small countdown calculation/timer using the authoritative expiry; keep the server as the source of truth.**

- [ ] **Step 6: Run the focused UI tests plus existing Buddy/entitlement tests.**

- [ ] **Step 7: Commit the countdown change separately.**

---

### Task 5: Repair BMAC Webhook Verification, Matching, Idempotency, and Lifecycle State

**Files:**
- Modify: exact current `buymeacoffee-webhook` Edge Function source identified in Task 1.
- Modify: exact BMAC event/membership migration files identified in Task 1.
- Test: exact Edge Function/BMAC test location identified in Task 1.

**Interfaces:**
- Consumes: BMAC webhook requests containing raw JSON body and `x-signature-sha256`.
- Produces: verified, retry-safe membership records/events for `membership.started`, `membership.updated`, `membership.cancelled`, and `membership.paused`.

- [ ] **Step 1: Write a failing test proving a valid HMAC-SHA256 signature is accepted and an invalid signature is rejected.**

- [ ] **Step 2: Write a failing test proving duplicate delivery of the same BMAC event is harmless.**

- [ ] **Step 3: Write a failing test proving an unmatched event remains retryable/matchable rather than being permanently marked processed.**

- [ ] **Step 4: Write a failing test proving cancelled/paused memberships retain access through their current paid-period end and then expire.**

- [ ] **Step 5: Run focused webhook tests and confirm they fail for the known lifecycle/idempotency defects.**

- [ ] **Step 6: Implement constant-time signature verification over the raw request body using the server-side webhook secret.**

- [ ] **Step 7: Implement deterministic event idempotency keyed by the provider event identity, with processing state that permits safe retry when account matching or downstream persistence cannot complete.**

- [ ] **Step 8: Implement exact membership status/end-date mapping from the existing BMAC payload contract; do not invent fields.**

- [ ] **Step 9: Ensure cancellation and pausing store the period end needed by the entitlement function rather than converting every non-paused event to `active`.**

- [ ] **Step 10: Run focused webhook, membership, and entitlement regression tests.**

- [ ] **Step 11: Commit the BMAC lifecycle change separately.**

---

### Task 6: Add Transactional Email Delivery and Idempotent Welcome Email

**Files:**
- Create: exact Supabase Edge Function path selected during Task 1 for transactional email.
- Create: exact email-event migration file selected during Task 1.
- Modify: exact authenticated session/bootstrap path identified in Task 1.
- Test: exact Edge Function/email test location identified in Task 1.

**Interfaces:**
- Produces: server-side email delivery using `RESEND_API_KEY` and `EMAIL_FROM` Supabase secrets, with an idempotency key per logical email event.
- Produces: a welcome-email operation that is safe to call repeatedly and never blocks authentication.

- [ ] **Step 1: Write a failing test proving the first successful login creates exactly one logical welcome-email event.**

- [ ] **Step 2: Write a failing test proving repeated login/session calls do not create duplicate welcome-email deliveries.**

- [ ] **Step 3: Write a failing test proving an email-provider failure is recorded but does not fail the authenticated login flow.**

- [ ] **Step 4: Run focused tests and confirm they fail because the delivery/idempotency infrastructure is absent or incomplete.**

- [ ] **Step 5: Add the minimal email-delivery/event schema with a uniqueness constraint on the logical idempotency key.**

- [ ] **Step 6: Implement the server-side email Edge Function using Supabase secrets and Resend idempotency semantics; never expose provider credentials to the browser.**

- [ ] **Step 7: Wire the first-login path to request the welcome email asynchronously/non-blockingly.**

- [ ] **Step 8: Run focused email tests and existing auth tests.**

- [ ] **Step 9: Commit the transactional email change separately.**

---

### Task 7: Add Explicit Email Preferences and Safe Update/Holiday/Marketing Channels

**Files:**
- Create: exact email-preferences migration file selected during Task 1.
- Modify: exact existing account/settings UI file selected during Task 1.
- Modify: exact email Edge Function from Task 6.
- Test: exact preferences/email test location selected during Task 1.

**Interfaces:**
- Produces: per-user opt-in flags for product updates, holiday messages, and marketing; transactional/service mail remains independent of those flags.

- [ ] **Step 1: Write a failing test proving all optional email categories default to opted out.**

- [ ] **Step 2: Write a failing test proving an opted-out user cannot receive optional update/holiday/marketing mail through the send path.**

- [ ] **Step 3: Write a failing test proving transactional membership/trial/security messages still send regardless of optional marketing preferences.**

- [ ] **Step 4: Run focused tests and confirm the intended failures.**

- [ ] **Step 5: Add the preferences table/RLS and the minimal settings controls using the project's existing UI conventions.**

- [ ] **Step 6: Add unsubscribe-safe behavior to optional email templates/links without exposing privileged server operations.**

- [ ] **Step 7: Run preferences, email, and RLS regression tests.**

- [ ] **Step 8: Commit the preference/channel change separately.**

---

### Task 8: Add Membership/Trial Transactional Lifecycle Messages

**Files:**
- Modify: exact BMAC webhook function from Task 5.
- Modify: exact email sender from Task 6.
- Test: exact lifecycle-email test location selected during Task 1.

**Interfaces:**
- Consumes: verified BMAC lifecycle events and authoritative trial state.
- Produces: idempotent transactional notifications for membership activation/change/cancellation/pause and appropriate trial lifecycle notices, without making webhook processing depend on email success.

- [ ] **Step 1: Write failing tests for membership-started, materially-updated, paused, and cancelled notification idempotency.**

- [ ] **Step 2: Write failing tests proving provider email failure never causes the BMAC webhook to become non-retry-safe or return the wrong acknowledgement.**

- [ ] **Step 3: Run focused tests and confirm failure.**

- [ ] **Step 4: Add the minimal event-to-email mapping and idempotency keys.**

- [ ] **Step 5: Run focused lifecycle tests plus all existing BMAC tests.**

- [ ] **Step 6: Commit lifecycle email changes separately.**

---

### Task 9: Determine and Implement a Free-Compatible Trial Reminder Schedule

**Files:**
- Read/modify: exact Supabase scheduling mechanism already available in the project, determined during Task 1.
- Modify: exact email sender/event schema from Tasks 6-8.
- Test: exact scheduling/email test location selected during Task 1.

**Interfaces:**
- Produces: retry-safe scheduled trial reminder events only if the project's existing Supabase capabilities support them without introducing a paid dependency.

- [ ] **Step 1: Inspect the project for an existing scheduler/cron facility and confirm whether it is already enabled.**

- [ ] **Step 2: Write failing tests for reminder eligibility and one-send-per-reminder idempotency.**

- [ ] **Step 3: Run the focused tests and confirm the intended failure.**

- [ ] **Step 4: Implement reminders only through the already-available free-compatible scheduling path; do not add a paid service solely for scheduling.**

- [ ] **Step 5: Run scheduler/email tests and verify no duplicate sends.**

- [ ] **Step 6: If no suitable scheduler exists without adding cost, stop this task after documenting that limitation rather than introducing a new paid dependency.**

---

### Task 10: Full Verification, Production Smoke, and PR Review Gate

**Files:**
- No new production files unless a test exposes a real defect.

**Interfaces:**
- Consumes: all changes from Tasks 2-9.
- Produces: verified PR-ready branch with no changes to `main` until review.

- [ ] **Step 1: Run the complete repository test suite.**

- [ ] **Step 2: Run typecheck, formatting check, lint, and the existing Buddy experience contract tests.**

- [ ] **Step 3: Run the existing local voice-path verification and confirm the current Qwen route remains selected with no retired VoxCPM2/voiceclonnx fallback.**

- [ ] **Step 4: Run the production deployment workflow only from the eventual reviewed merge path; do not trigger production during branch development unless a specific production smoke is required and explicitly authorized.**

- [ ] **Step 5: Verify Supabase migrations/functions against the intended branch state and run the authenticated first-login, countdown, BMAC webhook, membership-entitlement, and email smoke paths with test-safe data.**

- [ ] **Step 6: Verify the APK build remains tied to the same final application commit when a production merge is approved.**

- [ ] **Step 7: Inspect the final diff for secrets, destructive operations, debug leftovers, accidental protected-file changes, unrelated refactors, and legacy voice-provider references.**

- [ ] **Step 8: Use the verification-before-completion process and report only evidence-backed results.**

- [ ] **Step 9: Create the PR only after the branch is internally green and ready for review; do not merge it automatically.**

---

## Spec Coverage Check

- First-login-only seven-day trial: Tasks 2-4.
- Live days/hours/minutes/seconds countdown: Task 4.
- Server-authoritative expiry and paid-membership precedence: Task 3.
- BMAC $10/month membership entitlement: Tasks 3 and 5.
- BMAC HMAC verification: Task 5.
- BMAC lifecycle/idempotency/retry safety: Task 5.
- Cancellation/pausing paid-period retention: Tasks 3 and 5.
- Welcome email: Task 6.
- Membership/trial transactional messages: Task 8.
- Optional update/holiday/marketing opt-in: Task 7.
- Idempotent email delivery and non-blocking failures: Tasks 6-8.
- Scheduled trial reminders where free-compatible: Task 9.
- End-to-end verification and preservation of Qwen/protected systems: Task 10.

## Plan Self-Review

- No implementation path assumes an unverified repository filename; Task 1 resolves exact paths before edits.
- No task depends on an undefined function signature; database/API interfaces are created or preserved within the task that owns them.
- Every behavior-changing task begins with a failing test and verifies that failure before implementation.
- No paid dependency is introduced for email scheduling; provider credentials remain server-side secrets.
- No stale `.studio-memory/CURRENT-STATE.md` update is required, avoiding an unnecessary production-triggering commit.
