# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-09-11
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Main baseline:** `925b697cf9cf72113226cd8ba809a8deb1f79738`
**Feature branch:** `feat/qwen-local-offline-buddy-2026-09-11`
**Feature head:** `977747cb9e9b945164c31a4bae71e4d1a7fe37a8`
**PR:** #77 — local/offline Qwen Buddy path
**Production:** `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`
**Hosting:** Cloudflare Workers
**Product:** Buddy-first, Android-first, free/open-first creative studio for musicians and YouTubers.

## Current approved change

Buddy's reasoning path now prefers a real local Qwen endpoint on Android when available, using the OpenAI-compatible `/v1/chat/completions` contract. The default local server base is `http://127.0.0.1:8080`, matching the documented llama.cpp server default. The app does not bundle model weights; Qwen remains on-device. If the local endpoint is unavailable, incompatible, blocked by CORS, times out, or returns an empty/malformed response, Buddy automatically falls through to the existing server/free Qwen chain.

The local route is text-only by design. Multimodal turns continue through the existing remote Qwen/vision path. Red voice generation remains a separate verified artifact pipeline.

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
- Dedicated Buddy voice profile UI with natural speaker choices, multilingual language selection, upload/record-your-own-voice workflow, local voice-sample persistence, and verified voice-preview action.
- The Studio runtime automatically applies the saved Buddy voice/language to TTS jobs; a saved personal sample routes TTS through the voice-clone capability rather than silently substituting another voice.
- Buddy persistent memory is injected into chat while remaining separate from engineering memory.
- Buddy chat uses direct Cloudflare Workers AI when the binding is available, with Qwen3 text and Qwen 3.8 vision routing and a bounded OpenRouter fallback.
- Local/offline Qwen chat is now attempted first for text-only Buddy turns when a local endpoint is available.
- Red Buddy voice defaults to the verified 1.7B path and the current production branch has canonical Red reference routing and live latency improvements.
- Preset Voice Lab tests route directly to real preset TTS when no clone reference is required.
- The user's real Studio logo asset `1784996969001.png` is the live React StudioLogo source.
- APK build scaffold is present and rebuilds from `main` with monotonically increasing Android version codes.

## Verified foundations

- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and live Gradio schema discovery/provider fallback.
- Artifact extraction and validation before reporting media success.
- Supabase authentication and server-authoritative entitlement logic.
- Cloudflare production deployment configuration with Workers AI binding.
- PR #77 Security & Quality Gate passed TypeScript, formatting, ESLint, Buddy regression tests, static voice-path verification, production build, browser voice bundle verification, and dependency audit.
- PR #77 Free Open Validation passed audio artifact, music/video AV, Buddy voice, memory/cognitive, live latency, speech language normalization, Android voice smoke contract, Create flow, orchestrator, experience, cognitive core, Applio/RVC, typecheck, formatting, lint, and production build checks.

## Current verification gaps

1. PR #77 is implemented and CI-verified but still requires merge before its changes reach `main` and production.
2. A real Android offline smoke test must prove the actual local Qwen server/model returns a response through the installed APK/TWA.
3. A fresh APK must be rebuilt from the merged commit and installed on the Android device.
4. Real Android verification must confirm fast Buddy text response, non-generic context-aware answers, audible preset voices, audible Red voice, microphone turn-taking, and no browser fallback.
5. Real public free-provider execution remains conditional on queue/availability; each exposed capability must be tested with a returned artifact before being called verified.
6. Live verification of the Buy Me a Coffee membership webhook secret/production membership flow is still required before calling membership fully production-verified.
7. RVC/voice-swap still requires a real authorized model/reference input and a live converted artifact test.
8. Whole-app UI translation is not yet a complete localization layer; the Buddy voice/language preference is implemented first.

## Migration artifacts

- Hermes installation backup: `/storage/emulated/0/HermesBackup-2026-09-03-030731` (646 files, 37 MB, sha256-verified).
- Hermes engineering knowledge: `.studio-memory/HERMES_KNOWLEDGE_MIGRATION.md`.
- APK build scaffold: `.github/workflows/build-apk.yml` + `twa/twa-manifest.json`.
- Backup verification method: sha256sum of 7 critical files (`.hermes_history`, `MEMORY.md`, `USER.md`, `config.yaml`, `auth.json`, `SOUL.md`, `jobs.json`); all matched originals.

## Current route families

- Writing/reasoning: local Qwen first when available, then server-side Qwen3 + browser/local fallback.
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC and Applio/RVC fallbacks.
- Music: ACE-Step 1.5 + DiffRhythm fallback.
- Stems: Demucs.
- Artwork: Qwen Image / Qwen Image Edit / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Cloudflare Whisper with browser/provider fallbacks.

## Immediate next action

Merge PR #77 after the passing quality gates, allow the normal production deployment from `main`, then rebuild the Android APK from the merged commit and perform the real local-Qwen offline smoke test on the Samsung A12.

## Handoff rule

A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
