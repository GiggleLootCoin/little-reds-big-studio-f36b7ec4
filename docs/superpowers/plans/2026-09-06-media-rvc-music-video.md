# Full Music, Image, Video, and RVC/Song Replacement Plan

> This plan extends the approved account/trial/BMAC/email work. It is isolated to `feat/complete-trial-bmac-email` and must not touch `main`, AppDeploy, Pocket TTS, protected recordings, or the known-good Qwen3-TTS production voice route until verification and explicit review pass.

## Goal

Make Little Red's Big Studio actually perform the promised creative workflows rather than merely expose links to external demos:

1. Generate full songs.
2. Generate real song artwork.
3. Generate a complete music video for the entire finished song.
4. Clone/convert an authorized user's voice for singing.
5. Separate vocals from instrumental tracks.
6. Replace original vocals with the user's converted/cloned vocal while preserving the instrumental.
7. Validate every intermediate and final media artifact.

## Architecture

- Heavy inference remains on free/open hosted GPU runtimes; do not attempt full RVC/video inference on the Samsung Galaxy A12 CPU.
- Browser-side orchestration uses the existing `@gradio/client` dependency for public Hugging Face Spaces.
- Primary full-video engine: MiniMax H3 Turbo LoRA when its live public Space is healthy.
- Video fallback: a verified Wan 2.2 fast image-to-video Space.
- Full-song rendering is chunked to the verified video engine duration ceiling, then rendered locally in the browser against the exact finished song audio. This prevents the video model from replacing or shortening the user's actual song audio.
- Browser rendering uses native Canvas capture + Web Audio + MediaRecorder, with runtime MIME detection (prefer MP4 when the device can record it; otherwise WebM).
- RVC/SVC primary: an actually callable Applio/RVC runtime, with Seed-VC only as a singing-conversion fallback where RVC is unavailable. A registry entry alone is never treated as proof of working inference.
- Stem separation primary: Demucs runtime with actual output validation.
- The Worker remains an orchestration/API boundary; large GPU media processing does not run inside Cloudflare Workers.

## Mandatory Acceptance Criteria

### Full Music Video

- [ ] User starts from a finished song already present in Studio.
- [ ] Studio reads the real song duration.
- [ ] Studio builds bounded generation chunks covering exactly the whole duration.
- [ ] Every chunk produces a playable video artifact from a live free/open runtime.
- [ ] Generation can use the user's artwork/reference image when available.
- [ ] Prompts carry song title/direction/storyboard and scene timing.
- [ ] Final rendering uses the exact finished song audio.
- [ ] Final duration is within a strict tolerance of the source song duration.
- [ ] Final output contains both video and audio streams and is actually playable.
- [ ] User can preview and save the completed video.
- [ ] A failed engine can fall back to the next verified free engine without silently returning a fake/partial result.

### RVC / Vocal Replacement

- [ ] User can prepare an authorized voice reference/training dataset.
- [ ] A real RVC-compatible model/runtime is callable; no fake "installed" state.
- [ ] A song can be separated into at least vocals + instrumental.
- [ ] Vocal stem and instrumental stem are independently validated.
- [ ] Vocal conversion preserves timing/phrasing and supports singing pitch behavior.
- [ ] Converted vocal and original instrumental are recombined into a final song.
- [ ] Final mix duration matches the source track.
- [ ] Final mix is non-silent, playable, and checked for catastrophic clipping.
- [ ] Original vocals are not accidentally retained under the replacement vocal.
- [ ] User is warned/blocked from processing voices they are not authorized to use.

## TDD Tasks

### Task 1 — Creative pipeline contracts
- [x] Add failing tests for whole-song chunk coverage, bounded video chunk durations, and final artifact validation.
- [x] Implement the minimal pure planner/validator.
- [ ] Run the focused test suite and record the result.

### Task 2 — Real full-song video runtime
- [x] Implement real Gradio Space calls instead of opening a demo URL.
- [x] Implement primary/fallback engine selection.
- [x] Implement browser-side full-song rendering against exact song audio.
- [ ] Add deterministic tests around runtime response extraction and unsupported browser MIME handling.
- [ ] Run typecheck/lint/build and a real end-to-end short-song smoke test.

### Task 3 — Artwork generation
- [ ] Write failing tests proving an image request returns an actual image artifact.
- [ ] Wire the verified free image engine into the song package flow.
- [ ] Validate MIME type, byte size, decodeability, and non-empty pixels.
- [ ] Ensure generated artwork is automatically available as the video reference image.

### Task 4 — Song generation
- [ ] Write failing tests for full-song duration, lyrics propagation, and playable audio output.
- [ ] Prefer the best currently verified free/open full-song engine rather than the existing short MusicGen fallback.
- [ ] Preserve lyrics and song metadata through the generation request.
- [ ] Validate the actual generated audio before making it eligible for video generation.

### Task 5 — Stem separation
- [ ] Write failing tests for vocal/instrumental artifact pair completeness and duration alignment.
- [ ] Implement a real Demucs API call with file upload and output extraction.
- [ ] Validate every returned stem before allowing downstream RVC.
- [ ] Preserve a source-song backup and never destructively replace the user's original.

### Task 6 — RVC/SVC conversion
- [ ] Inspect the live Applio Space API contract and choose exact endpoints rather than guessing parameter names.
- [ ] Write failing tests for reference/model input, singing conversion, and output validation.
- [ ] Implement authorized reference/model upload and conversion.
- [ ] Add pitch/transpose controls appropriate for singing.
- [ ] Add Seed-VC fallback only if its live public runtime is verified reachable; never claim fallback availability when the Space is paused/unreachable.

### Task 7 — Song reconstruction
- [ ] Write failing tests for timing equality, non-silence, and clipping bounds.
- [ ] Recombine converted vocal + instrumental using a browser-compatible rendering path.
- [ ] Preserve stereo instrumental and final song duration.
- [ ] Validate the final song before it enters the music-video pipeline.

### Task 8 — Full creative-package workflow
- [ ] Write failing tests for `song -> artwork -> video` package completion.
- [ ] Connect finished-song output to artwork generation automatically.
- [ ] Connect artwork + song + storyboard to full music-video generation automatically.
- [ ] Surface progress by stage and never label a partial result as complete.
- [ ] Add retry at failed scene/stage boundaries where safe.

### Task 9 — Verification gate
- [ ] Run repository test suite.
- [ ] Run typecheck, lint, formatting, Buddy contract tests, and existing voice-route verification.
- [ ] Run a real media smoke using a non-sensitive short test asset.
- [ ] Verify no AppDeploy/Pocket-TTS/protected-recording changes.
- [ ] Verify no paid API/provider dependency was introduced.
- [ ] Verify no secrets were committed.
- [ ] Inspect final diff and only then create a draft PR for review.
- [ ] Do not merge or deploy until explicit review and all production gates pass.
