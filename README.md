# Little Red's Big Studio

**Buddy-first, Android-first, free-first creative studio for musicians and YouTubers.**

The Studio is designed around one simple experience: bring in your idea, music, voice or artwork and let **Buddy** decide how to move the project forward. Model names, provider setup and runner selection stay backstage.

## Production

- **Live app:** https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev
- **Source:** this private GitHub repository
- **Hosting:** Cloudflare Workers
- **Cost target:** $0 / no paid hosting required
- **AI policy:** no mandatory paid AI API and no mandatory provider account
- **Storage:** browser-first project storage where supported, with account-backed project structures available through Supabase
- **Device:** Android-friendly responsive web app

## Buddy orchestration

Buddy ranks available routes by capability and keeps free/open fallbacks ready. The Studio never claims that WebGPU, WebAssembly or a browser API is itself an AI model. Heavy generative work can be handed to public open/free runners when local execution is not genuinely available.

The normal user does **not** choose models or providers.

Every remote generation route is treated as a candidate until the live schema is compatible, the job actually runs, an artifact is returned and that artifact passes validation.

### Current free/open routes

- Writing/reasoning: Qwen3 routes with browser-local fallback
- Voice: Qwen3-TTS, MOSS-TTS, Chatterbox, Seed-VC and Applio/RVC fallbacks
- Music: ACE-Step 1.5 with DiffRhythm fallback
- Stems: Demucs
- Artwork: Qwen Image / Z Image Turbo / SDXL fallbacks
- Video: LTX 2.3 / Wan 2.2 fallbacks
- Speech recognition: Qwen3-ASR / Whisper fallbacks

Public free GPU services can have queues or temporary outages; Buddy therefore keeps alternatives rather than presenting one provider as guaranteed.

## Authentication and entitlements

Studio accounts use Supabase authentication. Trial and membership entitlement state is server-authoritative; browser/localStorage values do not grant paid access. Password recovery is supported.

The paid target is Buddy Unlimited at $10/month through Buy Me a Coffee. The signed webhook and entitlement RPC are part of the backend; the membership webhook secret must still be live-verified before membership is described as fully production-verified.

## Red's Ways Of Thinking

`Red's Ways Of Thinking` is kept as private reference material for Buddy. It is treated as a perspective/creative knowledge layer, not as a list of verified facts. Buddy can use it for creative framing and personal context while separating disputed claims from independently verifiable information when factual accuracy matters.

## Visual identity

The repository contains the uploaded visual-reference library under `assets/visual-references/` and the Studio uses the approved visual direction for its cinematic, glass, crimson/obsidian interface.

## Creator support

This Project Was Made With Love ❤️ By LittleRedBigSmile 🔴😁✨️

Support The Creator And Her Music On YouTube! 💃 🎧 🎶

- YouTube: https://youtube.com/@little-red-big-smile
- Cash App: https://cash.app/$LittleRedBigSmile
- Internationally: https://buymeacoffee.com/littleredbigsmile

## Development

The repository is a TanStack Start application built with Vite and TypeScript.

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
```

Cloudflare Worker deployment:

```sh
npm run deploy
```

GitHub Actions validates the main branch with dependency installation, TypeScript checking, formatting, linting and a production build. Cloudflare handles production deployment from the connected repository.
