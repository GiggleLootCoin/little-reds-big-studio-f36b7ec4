# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-08-12
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Branch:** `main`
**Current main commit:** `b22249114a79c790bf5cf70210f7e6cdf847e05a`
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
- A model registry entry is never treated as proof that weights are installed or that a provider is currently usable.

## Recently implemented

- Phone-call-style Buddy Live Chat with one primary call button, natural pause-based turn detection, real microphone capture, automatic microphone discovery, input-device preference/fallback, mute/end controls, and Record→Text plus Type modes.
- Animated Buddy reference character is the focal point of the live-call UI and reacts through the Buddy presence state system.
- Buddy visual motion was upgraded with breathing/floating, listening, thinking, speaking, success glow, eye-light, heart, music-note, headphone and shoe-light effects, with reduced-motion support.
- Dedicated Buddy voice profile UI with natural speaker choices, multilingual language selection, upload/record-your-own-voice workflow, local voice-sample persistence, and verified voice-preview action.
- The Studio runtime automatically applies the saved Buddy voice/language to TTS jobs; a saved personal sample routes TTS through the voice-clone capability rather than silently substituting another voice.
- The user's real Studio logo asset `1784996969001.png` is now the live React StudioLogo source. The exact requested visual assets are present in the repository: `file_00000000eb3881f49ec122117aff8aa7.png` (Red's Little Buddy Concept Sheet, 1,169,388 bytes), `1784996969001.png` (489,027 bytes), and `352ec815-8531-4e33-b671-f9c0bb390bb7.png` (755,306 bytes).
- Added `docs/AI-RUNTIME-MANIFEST.md` to distinguish real upstream models/routes from merely declared metadata.
- Self-contained Studio branding and stale asset-metadata imports that broke CI were removed.
- Production finish plan saved at `docs/superpowers/plans/2026-08-12-production-finish.md`.

## Verified foundations

- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and live Gradio schema discovery/provider fallback.
- Artifact extraction and validation before reporting media success.
- Supabase authentication and server-authoritative entitlement logic.
- Cloudflare production deployment configuration.
- Public Hugging Face route registry contains Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC, Applio/RVC, ACE-Step, DiffRhythm, Qwen Image, Qwen Image Edit, LTX, Wan and ASR fallback families.
- Current upstream checks confirm live public Spaces for ACE-Step 1.5, Qwen3-TTS, Qwen3-ASR, ApplioX, LTX 2.3, Qwen Image and Qwen Image Edit.

## Current known verification gaps

1. Fresh CI/deployment verification for current main is in progress; do not claim the live Worker has the newest commit until the deployment run and production smoke test pass.
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
- Artwork: Qwen Image / Qwen Image Edit / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Qwen3-ASR / Whisper fallbacks.

## Immediate next action

Finish the current CI/deployment run, then perform real Android/runtime and public-provider artifact tests. Do not claim full production completion until those gates have evidence.

## Handoff rule

A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
