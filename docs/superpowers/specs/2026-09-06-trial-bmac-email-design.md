# Little Red’s Big Studio — Trial, BMAC, and Email Design

## Goal
Make the account, seven-day trial, Buy Me a Coffee membership, entitlement, and email lifecycle reliable enough that the production product can be verified end-to-end rather than only by isolated smoke tests.

## Scope

### 1. Seven-day trial
- New accounts do not begin the trial merely because the auth row was created.
- The first successful authenticated login initializes `trial_started_at` exactly once.
- The server is authoritative for the trial end (`trial_started_at + 7 days`).
- Refreshing, logging out, reinstalling the APK, changing devices, or changing the browser cannot restart the trial.
- Existing users with a non-null `trial_started_at` retain their existing timestamp.
- The UI displays a live countdown with days, hours, minutes, and seconds while the trial is active.
- Expired trials remain expired until a valid paid entitlement exists.

### 2. Buy Me a Coffee
- Preserve the existing $10/month membership model and unlimited entitlement.
- Keep webhook signature verification server-side using the BMAC signing secret.
- Process membership started, updated, cancelled, and paused events idempotently.
- Cancellation/pausing must not revoke already-paid access before the stored paid period end.
- Account matching must be deterministic and retry-safe.
- Duplicate webhook deliveries must not create conflicting membership state.
- Production webhook behavior must be testable using BMAC's test-event facility.

### 3. Email
- Add a server-side transactional email service using Resend.
- Store the Resend API key only as a Supabase production secret; never commit it.
- Send a welcome email after the user's first successful login, once only.
- Add lifecycle emails for trial and membership events where appropriate.
- Keep transactional/service messages separate from optional marketing/news/holiday communications.
- Add explicit user email preferences for optional communications; do not silently opt users into marketing mail.
- Every transactional email request must use a deterministic idempotency key so retries cannot duplicate a message. Resend supports idempotency keys for this purpose.
- Email failures must not prevent authentication, entitlement calculation, or BMAC webhook processing from completing.

### 4. Verification
- Add automated tests for trial initialization, countdown boundaries, entitlement precedence, BMAC event idempotency/lifecycle, and email idempotency/preferences.
- Add production smoke coverage for the critical paths that can be safely automated.
- Verify the deployed Supabase Edge Functions and database schema, not just the source repository.
- Preserve the existing Qwen3-TTS production route and all existing voice/chat verification.

## Non-goals
- Do not modify AppDeploy.
- Do not modify Pocket TTS or protected voice recordings.
- Do not replace the current Qwen3-TTS production voice route.
- Do not perform unrelated refactors.

## Security
- BMAC signing secrets and Resend API keys remain server-side secrets.
- Client-side countdown display is informational; entitlement remains server-authoritative.
- Email marketing preferences are distinct from required transactional communications.
- Webhook handlers remain safe to retry and reject invalid signatures.

## Acceptance Criteria
1. A newly created account has no trial start until its first successful login.
2. The first successful login creates one immutable trial start timestamp and a seven-day server-side entitlement.
3. The UI countdown reaches zero at the same server-defined expiration boundary and cannot be reset by client actions.
4. A valid BMAC membership grants unlimited access and Buddy Unleashed.
5. Cancellation/paused membership retains access through the paid period end and then expires.
6. Duplicate BMAC events are harmless and do not corrupt membership state.
7. A welcome email is delivered once per user after first successful login when email delivery is configured.
8. Transactional retries cannot produce duplicate welcome/lifecycle emails.
9. Optional updates/holiday/promotional emails require an explicit opt-in and can be disabled.
10. Automated tests and production smoke checks pass before the change is merged.
11. The current Qwen voice route, Buddy chat, and APK production build remain green after the change.
