# Little Red's Big Studio — Free-First Production Architecture

## Goal

Make Little Red's Big Studio a dependable Android-first creator studio that Red can use every day for YPP, business, music, video, graphics, research, and personal creations, with a hard $0 operating requirement: no paid API, subscription, purchased credits, BYOP balance, or hidden metered service is required for core operation.

## Current baseline

Work is based on the existing GitHub source of truth `GiggleLootCoin/little-reds-big-studio-f36b7ec4`, on the isolated hardening branch rather than `main`. Lovable is out of scope and must not be touched. The current branch already contains substantial Android audio repairs, Red-clone routing, cover-pipeline work, runtime static-import hardening, and APK CI work.

## Core decisions

1. The phone is the control room. Native Android capabilities are used for microphone, speaker playback, file access, permissions, sharing, and local processing whenever practical.
2. Heavy generative models are never assumed to run on the Galaxy A12. They are accessed only through genuinely free/open routes when available.
3. External providers are adapters, never architectural foundations. Any provider may disappear, rate-limit, or fail without breaking the Studio.
4. No paid route may be selected automatically. A global `$0 Mode` blocks paid APIs, purchased credits, BYOP balances, and metered fallback routes.
5. Every AI/media operation has explicit lifecycle states: queued, running, succeeded, failed, unavailable. UI success is forbidden until the output artifact is verified.
6. Generated artifacts are persisted locally with metadata, provenance, MIME type, size, duration where applicable, and a playable/decodable check.
7. Red's cloned voice is a distinct capability. Generic Android TTS may be an emergency voice only; it may never be mislabeled as Red.
8. The app must use provider interfaces so engines can be replaced without changing user workflows.
9. Persistent APK distribution must not depend on Cloudflare. GitHub Releases/Artifacts are the preferred build and delivery infrastructure where available.
10. The architecture must remain usable if every optional cloud provider is unavailable.

## Capability architecture

### AI Provider Router

Define provider-neutral interfaces for text, image, video, music, TTS, STT, voice conversion, search, image editing, and audio processing.

Each provider declares capability, cost class, input limits, output type, and health. Routing order is:

- local/on-device free;
- self-hosted/open implementation reachable without payment;
- genuinely free hosted implementation with no required user spending;
- optional provider explicitly enabled by Red, but excluded from $0 Mode.

The router records why a route was selected and why fallback occurred.

### Red Voice

Create a `RedVoiceEngine` abstraction with:

- primary verified Red clone route;
- free/open fallback route(s) only when they can truthfully preserve the Red voice;
- native Android TTS as emergency non-Red voice;
- native file playback as the final audio transport.

The voice transaction is not successful until an actual audio artifact exists, is non-empty, has valid audio structure, and native playback reports actual start.

### Buddy

Buddy is an agent over the provider router, not a provider itself.

Buddy can:

- converse;
- invoke creator workflows;
- inspect project state;
- create and modify projects;
- plan media jobs;
- research;
- recover failed jobs;
- remember user-approved project preferences.

Hands-free operation uses native Android recording/permissions rather than browser-only capture.

### Music Lab

Use open music models as replaceable engines, with ACE-Step-class generation as the leading open candidate. The Studio owns the workflow around generation:

idea → lyrics/structure → generation → stem separation/editing → Red vocal conversion when requested → mix → master → export.

No commercial music service is required for the core path.

### Video Lab

Use an adapter architecture for strong open video models such as Wan/LTX/Hunyuan-class engines. The Studio owns the production pipeline:

brief → script → shot plan → visual continuity → clip generation → narration/music/SFX → captions → composition → export.

The phone does not attempt to run heavyweight video diffusion locally.

### Image Lab

Provide a Studio-owned image workflow covering background removal, replacement, cleanup, expansion, object isolation, enhancement, product/merch imagery, album art, and thumbnails. Open segmentation/image models are interchangeable underneath.

### Red Canvas

Provide an editable layer-based design surface for YouTube thumbnails, channel graphics, Shorts/Reels, album artwork, memberships, merchandise, business posts, and other creator formats. AI generation produces editable assets rather than only flattened images.

### Red Director

A Studio-owned orchestration layer converts a natural-language creative brief into a complete production project containing script, shot list, assets, narration, music, captions, design, and exports.

### Audio Lab

Use local/open tooling for trimming, conversion, normalization, stem handling, mixing, mastering, waveform inspection, and media validation. These functions must not depend on AI API credits.

## $0 enforcement

A central cost policy is evaluated before every provider call.

In $0 Mode:

- paid endpoints are blocked;
- API keys associated with paid billing are not sufficient authorization;
- BYOP/Pollen/credit balances are blocked;
- providers whose free tier is actually metered into paid usage are blocked;
- UI must explain that a free route is unavailable rather than silently charging.

The policy is testable independently from provider adapters.

## Failure and recovery

Every job must have deterministic failure semantics. A failed provider cannot leave a fake success state.

Fallback is allowed only between providers that satisfy the same capability contract and cost policy.

The UI must expose concise actionable status, not misleading messages such as “Buddy is speaking” when no audio was produced.

## Android reliability

The standalone APK must:

- contain the real Studio WebView/native bridge;
- request and correctly propagate microphone permission;
- use native audio playback;
- preserve the Little Red logo;
- avoid fragile dynamic runtime chunk loading for core runtime code;
- survive process/activity recreation without losing project metadata;
- use Android storage/share APIs for exported artifacts.

## Build and release

GitHub Actions remains the build system unless a better genuinely free path is demonstrated.

Release verification must include:

- clean production build;
- TypeScript/type checks;
- lint/format checks where configured;
- regression suites;
- APK existence and ZIP integrity;
- Android package metadata;
- APK signature verification;
- SHA-256;
- required native assets;
- production bundle/runtime smoke test;
- artifact provenance where supported.

A persistent release asset is preferred over expiring workflow artifacts for everyday installation.

## Definition of done

The Studio is not considered finished merely because CI is green.

The release candidate must support this real-world acceptance path:

1. Install APK on the target Galaxy A12.
2. Launch without a blank screen or missing chunk.
3. Logo and Studio UI load.
4. Buddy accepts text.
5. Buddy produces an actual audible response.
6. Red voice is used when Red voice generation succeeds; non-Red fallback is truthfully labeled.
7. Microphone permission works and speech input reaches the assistant.
8. A creator project can be created and persisted.
9. At least one media creation workflow produces a verified playable artifact.
10. Exported media can be opened and shared from the phone.
11. Provider failure produces a recoverable error rather than fake completion.
12. $0 Mode prevents paid/credit-consuming routes.

## Explicit non-goals

- Do not modify Lovable.
- Do not make Cloudflare, Netlify, Replit, Supabase, Hume, Pollinations, a single Hugging Face Space, or any single commercial provider a core dependency.
- Do not claim the Galaxy A12 can locally run heavyweight modern video/music foundation models.
- Do not ship an APK as “verified” solely because it compiled.
