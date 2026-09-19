# Little Red's Big Studio — Full Production Completion Design

## Goal
Finish the Studio as one honest, connected Android-first creative product: every user-facing capability either executes a real verified workflow or is clearly unavailable/removed, with Buddy coordinating the work and final artifacts saved/exportable.

## Current audit findings

The current main branch already contains substantial real infrastructure: Buddy chat/memory/orchestration, Android microphone capture, live web search, voice cloning and preset routing, free/open runner discovery, music/image/video runners, RVC/SVC and Demucs paths, and a music-video planner/renderer. The repository also contains tests for the music-video pipeline, voice paths, cognitive core, memory, web search, and creation contracts.

The major completion gaps are integration and production truth rather than a missing UI alone:

- The Create panel's "Track + Art + Video" flow currently generates a short video artifact rather than driving the full-song music-video pipeline.
- The media runner registry contains live public engines, but public ZeroGPU availability/schema changes still require real end-to-end validation at execution time.
- The full music-video renderer exists, but its Gradio video endpoint and output assumptions must be verified against the current live Spaces rather than treated as permanently valid.
- Artwork and media are currently represented locally with browser object URLs; durable project-level artifact persistence/export needs a complete path.
- Source-audio and reference-voice selectors exist, but the complete stem -> conversion -> reconstruction workflow must be verified as a connected product path.
- Buddy chat persists recent conversation locally, but multimodal attachments need to be carried through the actual server/model route consistently, not merely displayed in the message record.
- No dedicated camera-awareness or screen-awareness workflow is evident in the current Studio surface; these must be implemented only if the platform can provide a real permissioned path, otherwise the UI must not imply that capability.
- Hands-free voice exists and has automatic silence handling, but wake-phrase behavior and end-to-end Android spoken-response reliability need explicit acceptance tests.
- Entitlement/account infrastructure exists and must be checked against every generation capability so the free/trial/member behavior is consistent and server-authoritative.

## Architecture

Buddy remains the front door. The existing capability-based runtime stays in place, but every generation capability is treated as a verified artifact pipeline rather than a provider lookup. Provider adapters remain replaceable: the Studio discovers a live schema where applicable, executes the request, downloads the artifact, validates type/size/decodeability/duration/streams, and only then exposes success.

Heavy media inference remains off-device on free/open public GPU runtimes when needed. The Samsung Galaxy A12 is the orchestration/rendering client, not the inference server. Full-song music-video rendering uses the exact finished song audio and browser-side composition so a video model cannot silently alter or shorten the song.

Persistent project state is separated from development memory. Browser-first local storage remains the fast path, while account/project-backed storage is used where durable cross-device state is required. Temporary object URLs are never presented as durable saved artifacts.

## Completion contract

For every visible capability:

1. A real request reaches a compatible runtime.
2. The runtime returns an actual artifact or an explicit failure.
3. The artifact is downloaded/decoded and validated.
4. The artifact is attached to the current project/creation where appropriate.
5. The user can preview and export/share it.
6. A failed provider can fall back only to another verified route.
7. No job ID, placeholder, demo URL, stale registry entry, or partial artifact is reported as success.

## Capability acceptance matrix

### Buddy
- Text chat and agentic orchestration.
- Persistent relevant memory without fabricated memories.
- Live web lookup when current information is needed.
- Image attachments actually available to the reasoning route.
- Audio attachments/transcription where supported.
- Hands-free microphone conversation with spoken response.
- Preset voices use stored samples for preview; they do not trigger generation.
- Selected cloned Red voice genuinely affects Buddy speech.
- Wake phrase is implemented only with a real Android/browser-supported mechanism and honest permission/state handling.
- Camera and screen awareness are permissioned, explicit, and real; otherwise unavailable controls are removed.

### Creative media
- Lyrics generation.
- Full-song generation with real playable audio.
- Image/artwork generation with real decoded image output.
- Short video generation with real playable video output.
- Full music-video generation from a finished song, preserving exact source audio duration.
- Stem separation into validated vocal/instrumental outputs.
- Authorized RVC/SVC singing voice conversion.
- Reconstructed final song with validated timing/non-silence/clipping.
- Project package connecting song -> artwork -> music video.

### Project/product
- Creation history and project context.
- Durable artifact references where account/project persistence is promised.
- Preview/export/share for generated media.
- Honest free/trial/member limits enforced server-side.
- Privacy/permission messaging consistent with actual data flow.
- Android/TWA build and deployment remain reproducible.

## Provider policy

Do not introduce a mandatory paid AI provider. Prefer currently reachable free/open routes. Public Spaces are provisional: live schema, execution, and artifact validation are required on every route. Do not build permanent architecture around an API scheduled for shutdown.

## Protected boundaries

- Do not touch Lovable.
- Do not modify the known-good Buddy Red voice reference path unless required by a failing integration test.
- Do not replace the stored preset-preview behavior with TTS/generation.
- Do not commit secrets or provider credentials.
- Do not modify protected recordings or unrelated repository artifacts.
- Do not claim production completion from static tests alone.

## Verification gate

The finish line is a green repository suite plus real deployed smoke tests for each major capability, with actual artifacts validated on Android/browser paths. A capability that cannot be verified because an external free runtime is asleep or unavailable must report that limitation honestly rather than receive a synthetic success state.
