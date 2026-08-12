# Little Red's Big Studio — AI Model Pool

This registry records promising open/free model projects for evaluation and integration. It deliberately stores **links and integration metadata, not model weights**. Large checkpoints belong on an appropriate model host/runtime, not in Git.

## Music

### ACE-Step 1.5 — primary general music candidate

- Official: https://github.com/ace-step/ACE-Step
- Use: full-song generation, editing, extension, remixing and related music workflows.
- Role: primary general music engine; promote only after live artifact verification.

### DiffRhythm / DiffRhythm 2 — fast full-song alternative

- Official: https://github.com/ASLP-lab/DiffRhythm
- Use: fast full-length song generation.
- Role: fallback/specialist music engine.

### HeartMuLa / heartlib — lyrics/music specialist

- Official: https://github.com/HeartMuLa/heartlib
- Use: music generation with lyrics/tags/reference-audio conditioning.
- Role: additional music route; verify exact checkpoint licensing before commercial deployment.

## Speech / voice

### Qwen3-TTS — primary Buddy voice

- Official: https://github.com/QwenLM/Qwen3-TTS
- Use: expressive TTS, voice design, voice cloning and streaming.
- Role: primary Buddy speech engine.

### MOSS-TTS — voice/TTS alternative

- Official: https://github.com/OpenMOSS/MOSS-TTS
- Use: TTS, voice cloning, long-form speech, multilingual/code-switching and related audio capabilities.
- Role: fallback/specialist speech engine; verify model-specific licensing.

### OmniVoice — voice alternative

- Official: https://github.com/k2-fsa/OmniVoice
- Use: multilingual/zero-shot TTS candidate.
- Role: optional voice route after runtime and license verification.

### ScenA Audio — multi-speaker scene audio

- Project: https://finmickey.github.io/scena/
- Use: reference-driven multi-speaker audio scenes, dialogue and environmental audio research.
- Role: specialist scene-audio route, not a replacement for ordinary Buddy TTS.

### Dots TTS by AIQUEST

- Use: evaluate as an additional TTS/voice route if the supplied bundle maps to a verifiable public project.
- Role: optional; do not promote based on the filename alone.

### Applio / RVC resources

- Use: voice conversion and voice-swap workflows.
- Role: specialist voice-conversion pool.
- Important: the Studio must not require Colab or a computer for normal use.

### Cohere Transcribe bundle

- Use: speech-to-text candidate.
- Role: evaluate against free/open ASR routes and promote only after live artifact verification.

## Image generation

### Qwen-Image-2.0 — primary image generator/editor

- Official: https://github.com/QwenLM/Qwen-Image
- Use: high-fidelity text-to-image, precise image editing, complex typography and detailed imagery.
- License: Apache-2.0 for the Qwen-Image project/model release.
- Role: primary Studio image route.

### FLUX.2 klein 4B — fast image alternative

- Official: https://github.com/black-forest-labs/flux2
- Use: fast interactive text-to-image and image editing.
- License: Apache-2.0 for the 4B variants. Do not assume the 9B/dev variants have the same license.
- Role: optional fast route when the serving environment and licensing fit.

### HunyuanImage — image quality alternative

- Role: optional quality/photorealism route after current release, license and runtime verification.

## Video generation

### Wan2.2 — primary quality-focused open video candidate

- Official: https://github.com/Wan-Video/Wan2.2
- Use: text-to-video and image-to-video.
- License: Apache-2.0 project/model release.
- Role: primary quality route when adequate free/public GPU runtime exists.

### LTX-2.3 — practical audio-video candidate

- Official: https://github.com/Lightricks/LTX-2
- Use: text/image-to-video with synchronized audio/video pipelines and multiple performance modes.
- Role: practical/speed alternative to Wan and particularly interesting for music-video workflows.
- Important: official inference remains GPU-intensive; do not make users run it locally.

### HunyuanVideo — cinematic quality alternative

- Role: optional quality route where sufficient GPU runtime exists. Do not assume free compute availability.

### CogVideoX — lighter video fallback

- Role: lower-resource text/image-to-video fallback when heavier engines are unavailable.

## Lyrics generation

### Qwen3.6 — primary lyric-writing/planning engine

- Official: https://github.com/QwenLM/Qwen3.6
- License: Apache-2.0.
- Use: lyrics, rhyme schemes, song structure, rewrites, style transformation and prompt planning.
- Role: primary lyrics engine.

### Music-model lyric conditioning

- ACE-Step and HeartMuLa can consume approved lyrics to create music.
- Lyrics remain editable text artifacts before music generation.

## Current free Android execution map

The production UI now maps the user-facing creation actions to verified public/local routes without requiring Colab, Kaggle, a computer, or a paid Studio API. Current routes include Qwen Image for artwork, Wan 2.2 S2V and LTX 2.3 for video, Qwen3-TTS/Applio for voice, ACE-Step for music, Demucs/BS-Roformer for stems, and a local WebGPU writing route for lyrics.

These are **handoff routes**, not fake in-app completions: the Studio copies the prepared job prompt, opens the runner, and does not report success until an artifact is actually returned.

## Recommended user-facing routing

The user should see simple controls such as:

- **Generate Lyrics**
- **Generate Music**
- **Generate Image**
- **Generate Video**
- **Talk to Buddy**
- **Voice Clone / Voice Swap**

Provider/model names stay under the hood.

## Production routing rules

1. Never store large model weights in GitHub.
2. Never expose provider/model complexity in the UI.
3. Verify live capability/schema before promoting a provider.
4. Verify the actual returned artifact before reporting success.
5. Automatically fail over only to another provider that has passed capability and artifact checks.
6. Prefer the best usable model for the specific task, not necessarily the newest model.
7. Preserve older models when they are genuinely better for a particular job.
8. Do not require Colab, Kaggle or a computer for ordinary Studio use.
9. Commercial-use licensing must be checked per model before using it in the paid Studio service. Open/free does not automatically mean unrestricted commercial use.
10. Never put API keys, tokens, passwords or private credentials in this repository.
11. A green build is not proof of a working generator; every critical generator needs runtime evidence.
