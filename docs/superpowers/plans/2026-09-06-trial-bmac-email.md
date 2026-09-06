# Trial, BMAC, and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seven-day first-login trial, $10/month BMAC membership entitlement, and restrained transactional email lifecycle reliable end-to-end without disturbing the known-good Qwen production voice checkpoint.

**Architecture:** Keep entitlement decisions server-authoritative in Supabase/Postgres. Initialize the trial exactly once through an authenticated server-side operation after the first successful login, expose an authoritative expiry to the UI, and render a live countdown without allowing the client to change the timestamp. Process BMAC lifecycle webhooks with verified HMAC signatures, deterministic account matching, idempotency, and paid-period retention after cancellation/pausing. Send important transactional email from a Supabase Edge Function through server-side provider secrets, with an explicit allowlist of email events, deterministic idempotency, and separate opt-in preferences for non-transactional updates/holiday/marketing mail.

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
- Email sending uses an explicit allowlist: no routine/high-frequency messages, no every-login messages, no countdown-tick messages, and no emails for minor/non-material events.
- Birthday emails are at most once per calendar year and require DOB plus an enabled birthday-email preference.
- Milestones are limited to 3, 6, and 12 months, then meaningful annual milestones (24, 36, 48 months, etc.).
- All new behavior must follow TDD: failing test first, then minimal implementation, then green verification.

---

### Task 1: Map the Existing Auth, Entitlement, BMAC, Email, and Test Boundaries

**Files:**
- Read-only inspection of the exact current frontend auth/entitlement files, Supabase migrations/functions, package/test configuration, and deployment workflows on `39d0bbae3c277f8e850f7e38b17aca75b04b87a3`.

**Interfaces:**
- Consumes: current repository and Supabase project state.
- Produces: an implementation map identifying the exact existing files/functions/tables to change; no production behavior changes.

- [ ] **Step 1:** Locate the authenticated login/session success path and existing entitlement/countdown UI.
- [ ] **Step 2:** Locate the exact `profiles` schema, `trial_started_at` default/trigger/RLS, entitlement RPC, membership tables, and BMAC event table/function.
- [ ] **Step 3:** Locate existing email code/preferences, onboarding/profile settings, test runner, and Supabase deployment/scheduling mechanism.
- [ ] **Step 4:** Record only exact paths and existing function signatures in implementation notes; do not guess paths or create duplicate infrastructure.
- [ ] **Step 5:** Verify this inspection introduces no repository changes.

---

### Task 2: Make First-Login Trial Initialization Atomic and Immutable

**Files:**
- Modify: exact existing Supabase migration/schema files identified in Task 1.
- Modify: exact existing entitlement/auth database function identified in Task 1.
- Modify: exact existing frontend auth/session file identified in Task 1.
- Test: exact existing database/unit test location identified in Task 1.

**Interfaces:**
- Produces: an authenticated server operation that initializes `trial_started_at` only when it is null and returns the authoritative trial end timestamp.
- Produces: frontend login/session flow that invokes that operation after successful authentication and uses its server result.

- [ ] **Step 1:** Write failing tests for no trial before first successful login, exactly-once initialization, seven-day expiry, and concurrent/repeated-call immutability.
- [ ] **Step 2:** Run focused tests and confirm intended failures.
- [ ] **Step 3:** Remove the schema default that starts trials at profile creation, if confirmed present.
- [ ] **Step 4:** Implement the minimal atomic authenticated database operation.
- [ ] **Step 5:** Wire the existing successful-auth/session path to call it without changing unrelated auth behavior.
- [ ] **Step 6:** Run trial/auth/entitlement regression tests.
- [ ] **Step 7:** Commit the trial change separately.

---

### Task 3: Make Entitlement Precedence and Trial Expiry Server-Authoritative

**Files:**
- Modify: exact existing entitlement SQL/RPC identified in Task 1.
- Test: exact entitlement test location identified in Task 1.

**Interfaces:**
- Consumes: atomic first-login trial timestamp from Task 2.
- Produces: entitlement that expires exactly at seven days while valid paid membership takes precedence, including paid-period retention after cancellation/pausing.

- [ ] **Step 1:** Write failing tests for immediately-before, exactly-at, and after-expiry boundaries.
- [ ] **Step 2:** Write failing tests proving valid paid access overrides expired trial and cancellation/pausing retains access through paid-period end.
- [ ] **Step 3:** Run focused tests and confirm intended failures.
- [ ] **Step 4:** Implement the smallest SQL/RPC change needed.
- [ ] **Step 5:** Run focused and regression entitlement tests.
- [ ] **Step 6:** Commit the entitlement change separately.

---

### Task 4: Implement the Live Seven-Day Countdown UI

**Files:**
- Modify: exact existing trial/entitlement UI component identified in Task 1.
- Test: exact existing frontend test location identified in Task 1.

**Interfaces:**
- Consumes: authoritative trial expiry from the server.
- Produces: live days/hours/minutes/seconds countdown that reaches zero at server expiry and never writes trial state.

- [ ] **Step 1:** Write failing UI tests for server-provided remaining duration, expiry, and refresh persistence.
- [ ] **Step 2:** Run focused tests and confirm intended failures.
- [ ] **Step 3:** Implement the small countdown calculation/timer using authoritative expiry.
- [ ] **Step 4:** Run focused UI plus Buddy/entitlement tests.
- [ ] **Step 5:** Commit the countdown change separately.

---

### Task 5: Repair BMAC Webhook Verification, Matching, Idempotency, and Lifecycle State

**Files:**
- Modify: exact current `buymeacoffee-webhook` Edge Function source identified in Task 1.
- Modify: exact BMAC event/membership migration files identified in Task 1.
- Test: exact Edge Function/BMAC test location identified in Task 1.

**Interfaces:**
- Consumes: BMAC webhook requests containing raw JSON body and `x-signature-sha256`.
- Produces: verified, retry-safe membership records/events for `membership.started`, `membership.updated`, `membership.cancelled`, and `membership.paused`.

- [ ] **Step 1:** Write failing tests for valid/invalid HMAC, duplicate delivery, unmatched-event retry safety, and cancellation/pausing paid-period retention.
- [ ] **Step 2:** Run focused webhook tests and confirm failures.
- [ ] **Step 3:** Implement constant-time signature verification over the raw body using the server-side secret.
- [ ] **Step 4:** Implement deterministic provider-event idempotency that permits safe retry when matching/downstream persistence cannot complete.
- [ ] **Step 5:** Implement exact status/end-date mapping from the existing BMAC payload contract; do not invent fields.
- [ ] **Step 6:** Ensure cancellation/pausing stores the period end needed by entitlement rather than converting every non-paused event to `active`.
- [ ] **Step 7:** Run webhook, membership, and entitlement regression tests.
- [ ] **Step 8:** Commit the BMAC lifecycle change separately.

---

### Task 6: Add Transactional Email Delivery and Idempotent Welcome Email

**Files:**
- Create: exact Supabase Edge Function path selected during Task 1 for transactional email.
- Create: exact email-event migration file selected during Task 1.
- Modify: exact authenticated session/bootstrap path identified in Task 1.
- Test: exact Edge Function/email test location identified in Task 1.

**Interfaces:**
- Produces: server-side email delivery using `RESEND_API_KEY` and `EMAIL_FROM` Supabase secrets, with deterministic idempotency per logical email event.
- Produces: a welcome-email operation safe to call repeatedly and unable to block authentication.

- [ ] **Step 1:** Write failing tests proving first successful login creates exactly one logical welcome event and repeated session calls do not duplicate it.
- [ ] **Step 2:** Write a failing test proving provider failure is recorded without failing authentication.
- [ ] **Step 3:** Run focused tests and confirm failures.
- [ ] **Step 4:** Add the minimal email-event schema with uniqueness on logical idempotency key.
- [ ] **Step 5:** Implement the server-side Resend sender using Supabase secrets; never expose credentials to the browser.
- [ ] **Step 6:** Wire welcome delivery asynchronously/non-blockingly.
- [ ] **Step 7:** Run focused email/auth tests.
- [ ] **Step 8:** Commit the transactional email change separately.

---

### Task 7: Add Explicit Email Preferences and Safe Optional Channels

**Files:**
- Create: exact email-preferences migration file selected during Task 1.
- Modify: exact existing account/settings UI file selected during Task 1.
- Modify: exact email Edge Function from Task 6.
- Test: exact preferences/email test location selected during Task 1.

**Interfaces:**
- Produces: per-user opt-in flags for product updates, holiday messages, marketing, and birthday messages; required transactional mail remains independent.

- [ ] **Step 1:** Write failing tests proving optional categories and birthday mail default to opted out.
- [ ] **Step 2:** Write failing tests proving opted-out users cannot receive optional mail while transactional mail remains allowed.
- [ ] **Step 3:** Run focused tests and confirm intended failures.
- [ ] **Step 4:** Add preferences/RLS and minimal settings controls using existing UI conventions.
- [ ] **Step 5:** Add unsubscribe-safe behavior for optional mail.
- [ ] **Step 6:** Run preferences/email/RLS regression tests.
- [ ] **Step 7:** Commit preference changes separately.

---

### Task 8: Add DOB and Idempotent Birthday Emails

**Files:**
- Modify: exact profile/onboarding/settings files identified in Task 1.
- Create/Modify: exact profile migration identified in Task 1.
- Modify: exact email sender/scheduler from Tasks 6-7.
- Test: exact profile/birthday test location identified in Task 1.

**Interfaces:**
- Produces: private DOB storage and editable birthday-email preference.
- Produces: server-triggered birthday email with at most one send per user per calendar year.

- [ ] **Step 1:** Write failing tests for DOB persistence/RLS, missing DOB, disabled preference, correct birthday, wrong day, and duplicate scheduler execution.
- [ ] **Step 2:** Write failing tests for timezone boundaries and Feb 29 behavior (Feb 28 in non-leap years).
- [ ] **Step 3:** Run focused tests and confirm failures.
- [ ] **Step 4:** Add DOB/profile fields with appropriate RLS and validation; do not expose full DOB publicly.
- [ ] **Step 5:** Add server-side birthday eligibility and deterministic idempotency key such as `birthday:<user_id>:<year>`.
- [ ] **Step 6:** Add/use a server-authoritative timezone value for local-calendar evaluation without trusting the client to send mail.
- [ ] **Step 7:** Run birthday/profile/RLS tests.
- [ ] **Step 8:** Commit birthday functionality separately.

---

### Task 9: Add Important Membership and Creator Milestone Congratulations

**Files:**
- Modify: exact membership webhook/email-event code identified in Tasks 5-6.
- Create/Modify: exact milestone scheduling/query path identified in Task 1.
- Test: exact lifecycle/milestone test location identified in Task 1.

**Interfaces:**
- Produces: exactly-once congratulations email for successful unlimited membership activation.
- Produces: exactly-once creator milestone emails at 3, 6, and 12 months, then annual milestones only.

- [ ] **Step 1:** Write failing tests proving unlimited membership activation sends one congratulations email and duplicate webhook delivery does not resend it.
- [ ] **Step 2:** Write failing tests for 3-, 6-, and 12-month milestone eligibility, including boundary dates and duplicate scheduler runs.
- [ ] **Step 3:** Write failing tests proving 18-month/other non-allowlisted milestones do not send and annual 24/36/48-month milestones do send.
- [ ] **Step 4:** Run focused tests and confirm failures.
- [ ] **Step 5:** Implement the explicit email-event allowlist and deterministic milestone idempotency keys.
- [ ] **Step 6:** Implement scheduling only through an already-available free-compatible server scheduler; do not add a paid scheduler.
- [ ] **Step 7:** Ensure milestone evaluation uses a stable server-side account milestone date and is not reset by login/device changes.
- [ ] **Step 8:** Run lifecycle/milestone/email tests and verify no routine events can generate mail.
- [ ] **Step 9:** Commit milestone functionality separately.

---

### Task 10: Verify Scheduling Capability Without Introducing Email Spam

**Files:**
- Read/modify: exact existing Supabase scheduling mechanism identified in Task 1.
- Test: exact scheduler/email test location identified in Task 1.

**Interfaces:**
- Produces: retry-safe scheduled evaluation for birthday and milestone events, only if a free-compatible scheduler already exists.

- [ ] **Step 1:** Inspect whether Supabase already provides a scheduler/cron facility for this project.
- [ ] **Step 2:** Write failing tests for due-event selection, idempotency, timezone boundaries, and allowlist enforcement.
- [ ] **Step 3:** Run focused scheduler tests and confirm failure.
- [ ] **Step 4:** Implement only the minimum scheduled worker needed to evaluate birthday/milestone eligibility.
- [ ] **Step 5:** Verify the worker cannot emit arbitrary email types or send the same event twice.
- [ ] **Step 6:** If no suitable scheduler is available without cost, document the limitation and do not introduce a paid dependency.
- [ ] **Step 7:** Run scheduler/email regression tests.

---

### Task 11: Full Verification, Production Smoke, and PR Review Gate

**Files:**
- No new production files unless a test exposes a real defect.

**Interfaces:**
- Consumes: all changes from Tasks 2-10.
- Produces: verified PR-ready branch with no changes to `main` until review.

- [ ] **Step 1:** Run the complete repository test suite.
- [ ] **Step 2:** Run typecheck, formatting check, lint, and existing Buddy experience contract tests.
- [ ] **Step 3:** Run local voice-path verification and confirm current Qwen route remains selected with no retired VoxCPM2/voiceclonnx fallback.
- [ ] **Step 4:** Verify Supabase migrations/functions against intended branch state and run test-safe first-login, countdown, BMAC, membership, DOB/birthday, milestone, and email smoke paths.
- [ ] **Step 5:** Verify production scheduling/event idempotency without sending test mail to real users.
- [ ] **Step 6:** Verify the APK build remains tied to the same final application commit when a production merge is approved.
- [ ] **Step 7:** Inspect final diff for secrets, destructive operations, debug leftovers, accidental protected-file changes, unrelated refactors, and legacy voice-provider references.
- [ ] **Step 8:** Use verification-before-completion and report only evidence-backed results.
- [ ] **Step 9:** Create the PR only after the branch is internally green and ready for review; do not merge automatically.

## Spec Coverage Check

- First-login-only seven-day trial: Tasks 2-4.
- Live countdown: Task 4.
- Server-authoritative entitlement and paid-period retention: Task 3.
- BMAC $10/month membership and lifecycle: Task 5.
- Welcome email: Task 6.
- Optional update/holiday/marketing preferences: Task 7.
- Private DOB and birthday email: Task 8.
- Unlimited purchase congratulations: Task 9.
- 3/6/12-month and annual creator milestones: Task 9.
- Explicit no-spam allowlist: Tasks 6-10.
- Idempotent scheduled delivery: Tasks 8-10.
- End-to-end verification and preservation of Qwen/protected systems: Task 11.

## Plan Self-Review

- No implementation path assumes an unverified repository filename; Task 1 resolves exact paths before edits.
- No task depends on an undefined function signature; interfaces are created or preserved within the task that owns them.
- Every behavior-changing task begins with failing tests and verifies the intended failure before implementation.
- No paid dependency is introduced for scheduling; provider credentials remain server-side secrets.
- The email system is deliberately allowlist-based so adding an application event cannot silently create a new email.
- Birthday and milestone sends are deterministic and idempotent, including duplicate scheduler runs.
- No stale `.studio-memory/CURRENT-STATE.md` update is required, avoiding an unnecessary production-triggering commit.
