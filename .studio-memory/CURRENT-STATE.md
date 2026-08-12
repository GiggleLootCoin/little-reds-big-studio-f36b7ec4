# Little Red's Big Studio — CURRENT STATE

**Last updated:** 2026-08-12
**Authoritative repository:** `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
**Branch:** `main`
**Last observed main commit:** `0b89d9928c2e7aec2596f890d1a21125570e6b12`
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

## Verified foundations
- TanStack Start + Vite + TypeScript application.
- Production-oriented Buddy orchestration and free/open route selection.
- Supabase authentication and server-authoritative entitlement logic.
- Android hands-free Buddy microphone/runtime work exists in the production codebase.
- Cloudflare production deployment configuration exists.
- Production CI has been hardened to validate TypeScript, formatting, linting and production build.
- Studio branding was made self-contained so production does not depend on obsolete hosted logo metadata.

## Current known verification gaps
1. Live verification of the Buy Me a Coffee membership webhook secret/production membership flow is still required before calling membership fully production-verified.
2. End-to-end Android runtime generation testing remains a required final verification gate.
3. Remote free/open AI routes are candidates until live schema compatibility, execution, artifact return and artifact validation are confirmed.

## Current route families
- Writing/reasoning: Qwen3 + browser-local fallback.
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC, Applio/RVC fallbacks.
- Music: ACE-Step 1.5 + DiffRhythm fallback.
- Stems: Demucs.
- Artwork: Qwen Image / Z Image Turbo / SDXL fallbacks.
- Video: LTX 2.3 / Wan 2.2 fallbacks.
- Speech recognition: Qwen3-ASR / Whisper fallbacks.

## Immediate next action
Close only the remaining real verification gaps. Do not rebuild already-validated infrastructure. Verify production membership webhook configuration and perform Android/runtime generation smoke tests; record the exact results here and in `KNOWN-ISSUES.md`/`DEPLOYMENT.md`.

## Handoff rule
A future agent must read this file first, then `MASTER-SPEC.md`, `DECISIONS.md`, `KNOWN-ISSUES.md`, `PROVIDERS.md`, `DEPLOYMENT.md`, `CHANGELOG.md`, and `HANDOFF.md` before making architectural changes.
