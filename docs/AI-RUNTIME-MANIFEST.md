# Little Red's Big Studio — AI Runtime Manifest

This file is the machine/human-readable boundary between **real model availability** and UI claims.

## Important

Large model weights are **not** committed to the Cloudflare Worker or Git repository. That would make the Android-first product unusable and would exceed Worker limits. Heavy open models are executed through live public Gradio/ZeroGPU Spaces or an explicitly configured free GPU runner. Small browser-local models may be downloaded on demand.

A model is **not considered installed/ready merely because it appears in a registry**. The runtime must:

1. connect to the live route;
2. discover its current Gradio schema;
3. find a compatible endpoint;
4. execute the job;
5. receive a real artifact;
6. validate that artifact before reporting success; and
7. fall back to another compatible route when the provider is asleep, rate-limited, changed, or unavailable.

## Primary verified public routes

| Capability         | Model / engine          | Public route                             | Runtime role                    |
| ------------------ | ----------------------- | ---------------------------------------- | ------------------------------- |
| Music              | ACE-Step 1.5            | `ACE-Step/Ace-Step-v1.5`                 | primary song generation         |
| Speech / voice     | Qwen3-TTS               | `Qwen/Qwen3-TTS`                         | primary Buddy TTS / cloning     |
| Speech recognition | Qwen3-ASR               | `Qwen/Qwen3-ASR`                         | primary recorded STT fallback   |
| Voice conversion   | Applio / RVC            | `IAHispano/ApplioX`                      | RVC / voice-swap specialist     |
| Voice conversion   | Seed-VC                 | `Plachta/Seed-VC`                        | zero-shot VC fallback           |
| Voice              | Chatterbox Multilingual | `ResembleAI/Chatterbox-Multilingual-TTS` | multilingual TTS/clone fallback |
| Speech             | MOSS-TTS v1.5           | `OpenMOSS-Team/MOSS-TTS-v1.5`            | multilingual TTS/clone fallback |
| Artwork            | Qwen Image              | `Qwen/Qwen-Image`                        | image generation                |
| Artwork editing    | Qwen Image Edit         | `Qwen/Qwen-Image-Edit`                   | image editing                   |
| Video              | LTX 2.3                 | `Lightricks/LTX-2-3`                     | primary video route             |
| Video              | Wan 2.2                 | current public Wan 2.2 ZeroGPU Spaces    | video fallback                  |
| Stems              | Demucs                  | public Demucs Gradio route               | vocal/instrument separation     |
| Browser voice      | Kokoro WebGPU           | WebGPU-compatible public/local route     | low-latency TTS fallback        |

## User-facing rule

Provider and model names remain backstage. Buddy selects the best currently compatible route for the requested capability.

## RVC / song vocal-swap rule

RVC is a real conversion capability, not a button-only feature. A complete song voice-swap job must be treated as a pipeline:

`source song -> vocal separation -> converted vocal -> instrumental alignment -> reconstructed song -> playable artifact validation`

If any required stage cannot execute, the Studio must report the actual failure and must not claim the cover is complete.

## Current external verification notes

- ACE-Step 1.5 has a live public ZeroGPU Space and current open model weights.
- Qwen3-TTS has a live public ZeroGPU Space with voice design/cloning capability.
- Qwen3-ASR has a live public ZeroGPU Space and multilingual ASR support.
- ApplioX is a real RVC/voice-conversion project and public Space, but its public Space/API must still be live-tested before the Studio marks an RVC job green.
- LTX 2.3 has a live public ZeroGPU Space.
- Qwen Image and Qwen Image Edit have live public Spaces.

These facts establish that the upstream tools/models exist and are reachable; they do **not** by themselves prove a Studio end-to-end artifact. Production acceptance requires the runtime validation path above.
