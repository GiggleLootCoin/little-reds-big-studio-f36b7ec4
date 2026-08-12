# Little Red's Big Studio — AI Model Pool

This registry records promising open/free model projects for evaluation and integration. It deliberately stores **links and integration metadata, not model weights**. Large checkpoints belong on an appropriate model host/runtime, not in Git.

## Approved for integration evaluation

### Music
- ACE-Step 1.5 — https://github.com/ace-step/ACE-Step — Apache-2.0. High-priority music engine; full-song generation, editing, extension, remixing and vocal/BGM workflows. Prefer the official project only.
- DiffRhythm / DiffRhythm 2 — https://github.com/ASLP-lab/DiffRhythm — Apache-2.0. Strong fast full-length song option and valuable fallback/specialist engine.
- HeartMuLa / heartlib — https://github.com/HeartMuLa/heartlib — evaluate as an additional music engine for lyrics/tags/reference-audio conditioning. Confirm the exact model/checkpoint license at integration time.

### Speech / voice
- Qwen3-TTS — https://github.com/QwenLM/Qwen3-TTS — Apache-2.0. High-priority Buddy TTS/voice-design/voice-cloning engine.
- MOSS-TTS — https://github.com/OpenMOSS/MOSS-TTS — open-source family with TTS, voice cloning, long-form speech, multilingual/code-switching and sound-effect capabilities; strong fallback/specialist candidate. Verify model-specific license before commercial deployment.
- OmniVoice — https://github.com/k2-fsa/OmniVoice — promising multilingual zero-shot TTS candidate; evaluate runtime and license before promotion.

## Research / optional candidates

- ScenA — https://finmickey.github.io/scena/ — promising reference-driven multi-speaker audio-scene generation research. Keep as research candidate until runnable public inference/code is confirmed.
- Laguna S2.1 — not promoted yet; exact project/checkpoint could not be confidently identified from the name alone.
- Dots / AirQuest — not promoted yet; exact project/checkpoint could not be confidently identified from the name alone.

## Integration rules

1. Do not copy model weights into this repository.
2. Do not expose provider/model names in the user interface.
3. A model is not production-ready merely because its repository is public.
4. Before promotion, verify: license, live availability, input schema, output artifact, runtime cost, latency, failure modes, and Android/browser-compatible serving route.
5. Prefer free/public routes. Paid APIs are not required for the baseline Studio.
6. Keep multiple engines where they are materially useful; do not remove a proven engine merely because a newer model exists.
7. Automatic failover must only occur between providers that have passed live capability and artifact checks.
8. Never put API keys, tokens, passwords, or private credentials in this repository.
