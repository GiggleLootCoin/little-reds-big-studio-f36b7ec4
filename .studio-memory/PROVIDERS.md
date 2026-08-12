# Provider / Route Registry

This is a capability registry, not a promise that every public route is live at every moment.

| Capability         | Preferred free/open routes      | Fallbacks                            | Verification rule              |
| ------------------ | ------------------------------- | ------------------------------------ | ------------------------------ |
| Writing/reasoning  | Qwen3                           | browser-local                        | real response required         |
| Voice/TTS          | Qwen3-TTS, MOSS-TTS, Chatterbox | Seed-VC, Applio/RVC where applicable | playable/valid audio required  |
| Music              | ACE-Step 1.5                    | DiffRhythm                           | valid audio artifact required  |
| Stems              | Demucs                          | route fallback                       | valid separated stems required |
| Artwork            | Qwen Image, Z Image Turbo       | SDXL                                 | valid image artifact required  |
| Video              | LTX 2.3, Wan 2.2                | alternate public/open runner         | valid playable video required  |
| Speech recognition | Qwen3-ASR                       | Whisper                              | meaningful transcript required |

Buddy chooses among available routes. The user should not be required to know provider names. Public routes may be unavailable, queued or schema-incompatible; route health must be determined at runtime.
