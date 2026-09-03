# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-09-03
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Branch:** `main`
**Current main commit:** `42818f18775907193c672905050e1c72ddee64ee` (hotfix automation added; voice-runtime patch is the next automated commit)
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
- Dedicated Buddy voice profile UI with natural speaker choices, multilingual language selection, upload/record-your-own-voice workflow, local voice-sample persistence, and verified voice-preview action.
- The Studio runtime automatically applies the saved Buddy voice/language to TTS jobs; a saved personal sample routes TTS through the voice-clone capability rather than silently substituting another voice.
- Buddy persistent memory is injected into chat while remaining separate from engineering memory.
- Buddy chat uses direct Cloudflare Workers AI when the binding is available, with Qwen3 text and Qwen 3.8 vision routing and a bounded OpenRouter fallback.
- The rejected Whisper Turbo dependency is being removed from the runtime registry; the next hotfix removes the Turbo runner entry as well as the public Chatterbox Turbo route.
- Red Buddy voice now defaults to the verified 1.7B path instead of accidentally selecting 0.6B from the live-chat client.
- The Red clone gateway now accepts both `/api/voice-clone` and the `/api/ai/voice-clone` path used by the live client, fixing the client/gateway route mismatch.
- Preset Voice Lab tests route directly to real preset TTS when no clone reference is required; the next hotfix moves the dedicated server TTS route ahead of public Spaces and prevents clone-only Chatterbox probing for preset TTS.
- The user's real Studio logo asset `1784996969001.png` is the live React StudioLogo source.
- APK build scaffold is present and rebuilds from `main` with monotonically increasing Android version codes.

## Verified foundations

- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and live Gradio schema discovery/provider fallback.
- Artifact extraction and validation before reporting media success.
- Supabase authentication and server-authoritative entitlement logic.
- Cloudflare production deployment configuration with Workers AI binding.
- Security & Quality Gate run `33782967577` for the prior fixes passed all checks.
- Fresh APK artifact from commit `8dcb6df` was built and signed, but user testing exposed severe latency and missing audio, so it is not considered a functional final release.

## Current bug investigation

User-reported on Android APK: Buddy responses are extremely slow, Buddy gives generic responses, Buddy produces no audio, and none of the preset voice test buttons produce sound.

Root causes found in code inspection:
1. Preset TTS providers are sorted with public Qwen3-TTS (priority 1000) before the dedicated `/api/ai/tts` server route (priority 500), so the app can spend substantial time on a public Space before reaching the fast server path.
2. Generic TTS provider probing can reach Chatterbox routes even though those routes are clone-oriented, wasting time and failing without playable preset audio.
3. Gradio connection code retries a failed public Space three times with 0.7/1.4/2.1 second sleeps, adding avoidable latency.
4. TTS and chat have a 120-second generic timeout, so a dead provider can make Buddy appear frozen.
5. The runtime registry still contains the explicitly rejected Whisper Turbo entry and a Chatterbox Turbo entry, despite the product decision to avoid Turbo routes.

Hotfix automation has been added to apply these changes and run typecheck/lint/build before committing them. No Lovable or Pocket TTS changes are part of this fix.

## Current known verification gaps

1. The hotfix commit and its production deployment must pass before it is called fixed.
2. A fresh APK must be rebuilt from the hotfix commit and installed on the Android device.
3. Real Android verification must confirm fast Buddy text response, non-generic context-aware answers, audible preset voices, audible Red voice, microphone turn-taking, and no browser fallback.
4. Real public free-provider execution remains conditional on queue/availability; each exposed capability must be tested with a returned artifact before being called verified.
5. Live verification of the Buy Me a Coffee membership webhook secret/production membership flow is still required before calling membership fully production-verified.
6. RVC/voice-swap still requires a real authorized model/reference input and a live converted artifact test.
7. Whole-app UI translation is not yet a complete localization layer; the Buddy voice/language preference is implemented first.

## Migration artifacts

- Hermes installation backup: `/storage/emulated/0/HermesBackup-2026-09-03-030731` (646 files, 37 MB, sha256-verified).
- Hermes engineering knowledge: `.studio-memory/HERMES_KNOWLEDGE_MIGRATION.md`.
- APK build scaffold: `.github/workflows/build-apk.yml` + `twa/twa-manifest.json`.
- Backup verification method: sha256sum of 7 critical files (`.hermes_history`, `MEMORY.md`, `USER.md`, `config.yaml`, `auth.json`, `SOUL.md`, `jobs.json`); all matched originals.

## Current route families

- Writing/reasoning: Qwen3 + browser-local fallback.
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC and Applio/RVC fallbacks.
- Music: ACE-Step 1.5 + DiffRhythm fallback.
- Stems: Demucs.
- Artwork: Qwen Image / Qwen Image Edit / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Cloudflare Whisper with browser/provider fallbacks.

## Immediate next action

Let the automated Buddy voice hotfix commit, pass quality gates, deploy, rebuild the APK, and then verify the resulting APK artifact before asking for another install test.

## Handoff rule

A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
