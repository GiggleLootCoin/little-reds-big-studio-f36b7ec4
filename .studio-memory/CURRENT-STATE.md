# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-08-12
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Branch:** `main`
**Current main commit:** `6e83924db7acf0837dfbc2e7def3dd1afdf740f7`
**Production:** `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`
**Hosting:** Cloudflare Workers
**Product:** Buddy-first, Android-first, free/open-first creative studio for musicians and YouTubers.

## Non-negotiable product rules

- Real working product, not a visual demo.
- Android/mobile-first; do not assume a computer.
- Prefer free/open solutions and avoid mandatory paid AI APIs/provider accounts.
- Users should not have to understand or select model/provider machinery.
- Never claim a generation succeeded until a compatible route ran, an artifact returned, and the artifact passed validation.
- Keep free/open fallbacks available; public free GPU services may queue or fail.
- Buddy must retain relevant user/project context across conversations through persistent storage rather than relying on one chat thread.
- Keep development/engineering memory separate from Buddy's user memory/Creative DNA.
- Browser/OS microphone permission cannot be bypassed; the app must distinguish permission failure from device-selection failure and recover where possible.
- Voice cloning/conversion is only for a voice the user owns or is authorized to transform.

## Recently implemented

- Phone-call-style Buddy Live Chat with one primary call button, natural pause-based turn detection, real microphone capture, automatic microphone discovery, input-device preference/fallback, mute/end controls, and Record→Text plus Type modes.
- Animated Buddy reference character is the focal point of the live-call UI and reacts through the existing Buddy presence state system.
- Dedicated Buddy voice profile UI with natural speaker choices, multilingual language selection, upload/record-your-own-voice workflow, local voice-sample persistence, and verified voice-preview action.
- The Studio runtime now automatically applies the saved Buddy voice/language to TTS jobs; a saved personal sample routes TTS through the voice-clone capability rather than silently substituting another voice.
- Self-contained Studio logo usage on authentication and Buddy presence; stale asset-metadata imports that broke CI were removed.
- Production finish plan saved at `docs/superpowers/plans/2026-08-12-production-finish.md`.
- Agentic validation formatted the repository and committed `6e83924db7acf0837dfbc2e7def3dd1afdf740f7`.

## Verified foundations

- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and free/open route selection.
- Supabase authentication and server-authoritative entitlement logic.
- Cloudflare production deployment configuration.
- CI has passed TypeScript, formatting, linting and production build on the pre-format source revision; the formatted current main must still receive a fresh validation run.
- Permanent `.studio-memory/` handoff layer is merged into `main`.
- Public Hugging Face route registry contains Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC, Applio/RVC, ACE-Step, DiffRhythm, Qwen Image, LTX, Wan and ASR fallback families; public route metadata is not treated as execution proof.

## Current known verification gaps

1. Fresh CI verification of the formatted current main is still required.
2. The real Android/browser runtime still needs a device-level smoke test for microphone permission, selected input, Live Chat turn-taking and one real generation artifact.
3. Real public free-provider execution remains conditional on queue/availability; each exposed capability must be tested with a returned artifact before being called verified.
4. Live verification of the Buy Me a Coffee membership webhook secret/production membership flow is still required before calling membership fully production-verified.
5. RVC/voice-swap still requires a real authorized model/reference input and a live converted artifact test; repository route metadata alone is not proof of execution.
6. Whole-app UI translation is not yet a complete localization layer; the Buddy voice/language preference is implemented first.

## Current route families

- Writing/reasoning: Qwen3 + browser-local fallback.
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC and Applio/RVC fallbacks.
- Music: ACE-Step 1.5 + DiffRhythm fallback.
- Stems: Demucs.
- Artwork: Qwen Image / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Qwen3-ASR / Whisper fallbacks.

## Immediate next action

Fresh-validate the formatted main, then perform real Android/runtime and public-provider artifact tests. Do not claim full production completion until those gates have evidence.

## Handoff rule

A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
