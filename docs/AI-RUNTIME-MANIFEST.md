# Little Red's Big Studio — AI Runtime Manifest

This file is the machine/human-readable boundary between **real model availability** and UI claims.

## Important

Large model weights are **not** committed to the Cloudflare Worker or Git repository. That would make the Android-first product unusable and exceed Worker limits. Heavy open models run through live public Gradio/ZeroGPU Spaces or an explicitly configured free GPU runner. Small browser-local models may be downloaded on demand.

A model is **not considered installed/ready merely because it appears in a registry**. The runtime must:

1. Connect to the live route.
2. Discover its current Gradio schema.
3. Find a compatible endpoint.
4. Execute the job.
5. Receive a real artifact.
6. Validate that artifact before reporting success.
7. Fall back to another compatible route when the provider is asleep, rate-limited, changed, or unavailable.

## Primary public routes

- **Music:** ACE-Step 1.5 — `ACE-Step/Ace-Step-v1.5` — primary song generation.
- **Speech / voice:** Qwen3-TTS — `Qwen/Qwen3-TTS` — primary Buddy TTS and cloning.
- **Speech recognition:** Qwen3-ASR — `Qwen/Qwen3-ASR` — recorded STT fallback.
- **Voice conversion:** Applio / RVC — `IAHispano/ApplioX` — RVC and voice-swap specialist.
- **Voice conversion:** Seed-VC — `Plachta/Seed-VC` — zero-shot VC fallback.
- **Voice:** Chatterbox Multilingual — `ResembleAI/Chatterbox-Multilingual-TTS` — multilingual TTS/clone fallback.
- **Speech:** MOSS-TTS v1.5 — `OpenMOSS-Team/MOSS-TTS-v1.5` — multilingual TTS/clone fallback.
- **Artwork:** Qwen Image — `Qwen/Qwen-Image` — image generation.
- **Artwork editing:** Qwen Image Edit — `Qwen/Qwen-Image-Edit` — image editing.
- **Video:** LTX 2.3 — `Lightricks/LTX-2-3` — primary video route.
- **Video:** Wan 2.2 — current public Wan 2.2 ZeroGPU Spaces — video fallback.
- **Stems:** Demucs — public Demucs Gradio route — vocal/instrument separation.
- **Browser voice:** Kokoro WebGPU — WebGPU-compatible public/local route — low-latency TTS fallback.

## User-facing rule

Provider and model names remain backstage. Buddy selects the best currently compatible route for the requested capability.

## RVC / song vocal-swap rule

RVC is a real conversion capability, not a button-only feature. A complete song voice-swap job is treated as this pipeline:

`source song -> vocal separation -> converted vocal -> instrumental alignment -> reconstructed song -> playable artifact validation`

If any required stage cannot execute, the Studio must report the actual failure and must not claim the cover is complete.

## Verification rule

Upstream availability establishes that the tools/models exist and are reachable. It does **not** prove Studio end-to-end execution. Production acceptance requires the runtime to execute the route and validate the returned artifact.
