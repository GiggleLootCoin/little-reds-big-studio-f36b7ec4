# Known Issues / Verification Gaps

## Open — membership webhook
The Buy Me a Coffee signed webhook/entitlement path is implemented, but the live production value of `BMAC_WEBHOOK_SECRET` has not been independently verified from the repository. Do not claim the membership flow is fully production-verified until a real signed webhook test succeeds.

## Open — Android runtime
CI/build success does not prove microphone, hands-free Buddy, authentication, or generation works on an Android device/browser. Perform an Android smoke test covering sign-in, microphone permission, Buddy speech loop, a real generation request and returned artifact validation.

## Conditional — public AI routes
Free public GPU endpoints can queue, rate-limit, change schemas or temporarily fail. Buddy must treat them as replaceable candidates and fall back when validation fails.

## Closed historical dead end — stale hosted logo metadata
Obsolete hosted logo metadata caused production asset failures. Local/public repository assets now provide the Studio branding; do not reintroduce the old dependency.

## Rule
When an issue is resolved, record the evidence and date rather than deleting the history. When an approach fails, record why so future agents do not repeat it.
