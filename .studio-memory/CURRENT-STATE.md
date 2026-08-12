# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-08-12
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Branch:** `main`
**Current main commit at this update:** `52decf7e7cd27bc0be9d9e34d448c671ef98baee`
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
- Dedicated Buddy voice profile UI with real natural Qwen-compatible speaker choices, multilingual language selection, upload/record-your-own-voice workflow, local voice-sample persistence, and a verified voice-preview action using the voice-clone runtime.
- Self-contained Studio logo usage on authentication and Buddy presence; stale asset-metadata imports that broke CI were removed.
- Production finish plan saved at `docs/superpowers/plans/2026-08-12-production-finish.md`.
- Current CI verification reached TypeScript success and the agentic validation workflow completed successfully after formatting; the formatting workflow committed `52decf7e7cd27bc0be9d9e34d448c671ef98baee`.

## Verified foundations

- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and free/open route selection.
- Supabase authentication and server-authoritative entitlement logic.
- Cloudflare production deployment configuration.
- Production CI validates TypeScript, formatting, linting and production build.
- Permanent `.studio-memory/` handoff layer is merged into `main`.
- Public Hugging Face route registry contains Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC, Applio/RVC, ACE-Step, DiffRhythm, Qwen Image, LTX, Wan and ASR fallback families; public route metadata is not treated as execution proof.

## Current known verification gaps

1. The real Android/browser runtime still needs a device-level smoke test for microphone permission, selected input, Live Chat turn-taking and one real generation artifact.
2. Real public free-provider execution remains conditional on queue/availability; each exposed capability must be tested with a returned artifact before being called verified.
3. Live verification of the Buy Me a Coffee membership webhook secret/production membership flow is still required before calling membership fully production-verified.
4. Buddy Live Chat currently uses the selected personal voice profile for the dedicated voice-preview path; wiring that profile into the live-call TTS loop remains a final integration check.

## Current route families

- Writing/reasoning: Qwen3 + browser-local fallback.
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC and Applio/RVC fallbacks.
- Music: ACE-Step 1.5 + DiffRhythm fallback.
- Stems: Demucs.
- Artwork: Qwen Image / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Qwen3-ASR / Whisper fallbacks.

## Immediate next action

Run the formatted current main through CI again, then perform real Android/runtime and public-provider artifact tests. Do not claim full production completion until those gates have evidence.

## Handoff rule

A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
