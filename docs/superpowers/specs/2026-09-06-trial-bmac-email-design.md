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

### 3. Email — important messages only
- Add a server-side transactional email service using Resend.
- Store the Resend API key only as a Supabase production secret; never commit it.
- Send a welcome email after the user's first successful login, once only.
- Send a one-time congratulations email when the user successfully purchases/activates the unlimited membership.
- Send creator milestone congratulations at 3 months, 6 months, and 12 months after the user's account creation/first successful login milestone; after 12 months, continue only at meaningful annual milestones (24, 36, 48 months, etc.).
- Send one birthday email per calendar year when the user has supplied a date of birth and enabled birthday emails.
- Collect DOB during onboarding/profile setup, allow it to be edited, protect it with RLS/server-side access, and never expose the full DOB publicly or place it in logs, analytics, webhook payloads, or email content.
- Store a user timezone (captured from the authenticated client when appropriate and editable if the product already supports profile preferences) so birthday and milestone dates are evaluated on the user's local calendar; server-side scheduling remains authoritative.
- Leap-day birthdays must have deterministic behavior: send on February 28 in non-leap years unless the product later exposes a different user preference.
- Keep transactional/service messages separate from optional marketing/news/holiday communications.
- Optional update/holiday/marketing messages require explicit opt-in and are not part of the normal lifecycle email stream.
- **Email restraint rule:** never send routine emails for every login, ordinary usage, minor profile changes, routine countdown ticks, every feature release, or non-material membership updates. The system must use an explicit allowlist of email event types rather than sending whenever an arbitrary event occurs.
- Every email event must have a deterministic idempotency key so retries cannot duplicate a message. Resend supports idempotency keys for this purpose.
- Email failures must not prevent authentication, entitlement calculation, or BMAC webhook processing from completing.

### 4. Verification
- Add automated tests for trial initialization, countdown boundaries, entitlement precedence, BMAC event idempotency/lifecycle, email idempotency/preferences, DOB/privacy, birthday timing, and milestone eligibility.
- Add production smoke coverage for the critical paths that can be safely automated.
- Verify the deployed Supabase Edge Functions and database schema, not just the source repository.
- Preserve the existing Qwen3-TTS production route and all existing voice/chat verification.

## Non-goals
- Do not modify AppDeploy.
- Do not modify Pocket TTS or protected voice recordings.
- Do not replace the current Qwen3-TTS production voice route.
- Do not perform unrelated refactors.
- Do not introduce routine or high-frequency lifecycle email campaigns.

## Security
- BMAC signing secrets and Resend API keys remain server-side secrets.
- Client-side countdown display is informational; entitlement remains server-authoritative.
- DOB is private profile data protected by server-side authorization/RLS.
- Email marketing preferences are distinct from required transactional communications.
- Webhook handlers remain safe to retry and reject invalid signatures.
- Birthday and milestone jobs are server-triggered and cannot be initiated by an untrusted client to send arbitrary mail.

## Acceptance Criteria
1. A newly created account has no trial start until its first successful login.
2. The first successful login creates one immutable trial start timestamp and a seven-day server-side entitlement.
3. The UI countdown reaches zero at the same server-defined expiration boundary and cannot be reset by client actions.
4. A valid BMAC membership grants unlimited access and Buddy Unleashed.
5. Cancellation/paused membership retains access through the paid period end and then expires.
6. Duplicate BMAC events are harmless and do not corrupt membership state.
7. A welcome email is delivered once per user after first successful login when email delivery is configured.
8. A successful unlimited-membership activation produces one congratulations email and duplicates are suppressed.
9. Creator milestones produce at most one email at 3, 6, and 12 months, then at meaningful annual milestones only.
10. A birthday email is sent at most once per calendar year, only when DOB is present and the birthday-email preference is enabled.
11. No routine high-frequency email is generated; arbitrary application events cannot create email without an allowlisted email type.
12. Transactional retries cannot produce duplicate welcome, membership, birthday, or milestone emails.
13. Optional updates/holiday/promotional emails require an explicit opt-in and can be disabled.
14. Automated tests and production smoke checks pass before the change is merged.
15. The current Qwen voice route, Buddy chat, and APK production build remain green after the change.
