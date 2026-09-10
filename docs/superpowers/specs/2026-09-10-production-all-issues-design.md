# Production All-Issues Hardening Design

**Goal:** Make the current Little Red's Big Studio production path reliable without replacing its architecture or touching prohibited services.

## Scope

1. Repair the Qwen3-TTS reference-clone gateway and expose actionable upstream errors.
2. Prove Red clone generation with and without reference transcript and preserve the 0.6B fast/free default.
3. Harden Buddy's STT -> brain -> response -> TTS -> mobile playback chain and its context/memory contracts.
4. Transplant only verified media AV validation/hardening from PR #65 onto current main; do not merge PR #65 wholesale.
5. Verify production deployment, smoke coverage, and signed Android artifact generation.
6. Audit membership/webhook/email/localization and free/open reliability paths; fix only concrete failures found.

## Non-goals and hard boundaries

- Do not touch Lovable.
- Do not touch AppDeploy or deploy through it.
- Do not switch production voice away from Qwen3-TTS.
- Do not add paid providers or unnecessary provider failover.
- Do not delete or alter protected voice recordings.
- Do not restart old microphone experiments.

## Design

The Qwen gateway remains the single production Red clone route. Its Gradio contract will be made tolerant of current terminal-event shapes and will retain binary WAV/artifact handling. Diagnostics will preserve useful upstream error detail while keeping client-facing errors safe.

Buddy's existing request flow remains the integration point. Tests will assert that a user interaction unlocks audio before asynchronous work, that successful AI text can reach the TTS path, and that a valid audio artifact is returned for playback. Existing memory/context behavior will be tested at its actual interfaces rather than simulated by a shallow chat-only smoke.

Media hardening will be transplanted selectively from PR #65 after comparing each changed file against current main. Existing free video engines and rendering behavior stay intact unless validation demonstrates a concrete defect.

Production verification is evidence-based: typecheck/lint/unit tests, workflow status, live endpoint smoke, and the generated APK artifact must be checked before declaring completion.

## Success criteria

- Red voice preview returns playable audio on the live production route, including the verified reference clone path.
- Buddy can complete STT -> AI response -> TTS -> playback without a disconnected/placeholder voice state.
- Preset voice preview/use paths remain functional.
- Music-video output is rejected when AV streams are invalid and accepted only when playable and duration-valid.
- Current main deploy is proven by workflow/live evidence.
- Android APK is rebuilt from the verified commit and its production endpoint configuration is checked.
- Any remaining limitation is explicitly identified with evidence rather than guessed away.
