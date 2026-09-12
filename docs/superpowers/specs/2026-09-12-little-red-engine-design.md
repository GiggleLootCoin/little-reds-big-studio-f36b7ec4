# Little Red Engine / Community Compute Architecture

Date: 2026-09-12
Status: Design for review

## 1. Goal

Turn Little Red's Big Studio from a provider-dependent application into a provider-agnostic, local-first creative AI system. Buddy remains the user-facing experience; a Little Red Engine becomes the stable capability layer underneath it. Compute may run locally, on another device owned by the user, on an opt-in community worker, or on an external fallback provider.

The architecture must support the existing Android-first/free-first product while creating a path toward a privacy-preserving Community Cloud in which users may voluntarily contribute spare compute, storage/cache, bandwidth, or idle time.

## 2. Non-goals

- Do not require a paid AI provider.
- Do not make Cloudflare Workers AI, Qwen, Hugging Face, Aura, or any single vendor a hard dependency for the product architecture.
- Do not silently use another user's device.
- Do not treat personal conversations, recordings, memories, photos, or voice models as community cache.
- Do not attempt to bypass provider quotas, rate limits, or account controls.
- Do not touch Lovable.

## 3. Core principles

1. Local-first: use the user's device whenever it can perform the job acceptably.
2. Provider-agnostic: Buddy requests capabilities, not vendor-specific APIs.
3. Privacy-by-default: personal data remains private unless the user explicitly authorizes a job to leave the device.
4. Explicit community consent: contribution is off by default and controlled by visible resource limits.
5. Graceful degradation: lack of a particular worker or provider must not break unrelated Buddy capabilities.
6. Cache before recompute: reusable public models/assets and safe intermediate results should be cached when authorized.
7. Verifiable completion: a feature is complete only when its end-to-end user journey works, not merely when code builds.
8. Portable workers: the same job protocol should support Android, desktop, server, and future hardware.

## 4. Logical architecture

Buddy -> Little Red Engine -> Job Scheduler -> Worker Registry -> selected worker.

The Engine exposes capability-level contracts such as brain, speech-to-text, text-to-speech, voice conversion, stem separation, music rendering, media processing, memory, and generic jobs. Provider/model selection happens behind those contracts.

Workers advertise capabilities, resource constraints, software/model versions, availability, and user-defined limits. The scheduler selects a worker based on capability, privacy requirements, locality, estimated cost/latency, and consent.

## 5. Worker classes

### Local Android worker

The first implementation target for Red's current setup. Android app integration may use native Android services/WorkManager where appropriate; Termux and Termux:API remain useful for the user's existing local environment, while Hermes acts as an orchestration worker where appropriate.

### Personal worker pool

Other devices owned by the same user may register as private workers. Private jobs can remain inside this pool without entering the community pool.

### Community worker

A user may explicitly opt into contributing spare resources. The worker must enforce limits such as Wi-Fi-only, charging-only, battery threshold, screen-idle requirement, CPU/GPU limits, storage quota, and schedule.

### External fallback

Third-party services may remain optional adapters for capabilities not yet implemented locally or in the community network. They must not define the core contracts.

## 6. Community resource model

The scheduler should treat resources independently:

- CPU compute
- GPU/NPU compute
- storage
- model/cache hosting
- bandwidth, only when explicitly enabled
- idle availability
- specialized model capabilities

Contribution accounting may later produce internal compute credits. Credits are not required for the first worker implementation and must not be implemented as a cryptocurrency or as a mechanism for bypassing provider limits.

## 7. Privacy/security model

Every job must carry a privacy classification and explicit authorization scope.

Private jobs must not be routed to community workers unless the user explicitly permits that class of processing. Workers should receive only the minimum data necessary for the assigned computation. Transport must be encrypted. Worker identity and job identity should be separable where practical. Community cache must contain only intentionally shared infrastructure assets or appropriately encrypted/authorized temporary data.

The system must expose a clear Community Compute OFF control and make contribution state visible.

## 8. Voice architecture

Spoken Buddy voice and singing voice conversion are separate capabilities.

### Spoken Buddy voice

- Red is the default personal voice.
- User-created voices are stored as private models/assets.
- Preset Voice preview means playback of a pre-existing sample; it must not trigger TTS generation.
- Selecting a preset for Buddy speech is separate from preview playback.

### Singing

Target pipeline:

song input -> vocal/instrumental separation -> target singing voice conversion -> mixing/master/export.

RVC-compatible inference is preferred for singing conversion. ONNX/browser/mobile inference should be investigated as a local path, with server/worker execution as a fallback. A current browser RVC runtime demonstrates an ONNX Runtime WASM/WebGPU path, while an Android RVC implementation demonstrates fully local ONNX inference on Android; both are candidates for evaluation, not automatic dependencies.

## 9. Memory and caching

User memory remains private account/device data.

Infrastructure cache may include verified model assets, public runtime assets, reusable public resources, and safe intermediate results. Cache entries require provenance, version, integrity metadata, and eviction policy.

The scheduler should prefer an existing compatible cached model/result before downloading or recomputing.

## 10. Android constraints

Android background execution is constrained by the OS. Long-running community work therefore needs explicit foreground/WorkManager-compatible behavior rather than assuming an unrestricted daemon. The app must never secretly consume resources in the background.

Termux/Hermes can provide an advanced local worker path, but the product must not require Termux for ordinary users.

## 11. Tooling candidates

Initial implementation should remain TypeScript/React/Cloudflare-compatible where possible because that matches the current repository. Worker protocols should be transport-neutral.

For peer connectivity, libp2p is a candidate because it provides encrypted transports, NAT traversal, relays, and browser/mobile/server support. It must be evaluated against a simpler HTTPS/WebSocket rendezvous approach before adoption.

For singing conversion, evaluate RVC ONNX/mobile/browser runtimes and a maintained CPU/GPU RVC implementation. Choose based on license, model compatibility, Android feasibility, performance, and quality rather than brand name.

## 12. Migration strategy

1. Preserve the existing Buddy UI and working product behavior.
2. Introduce capability contracts and an Engine facade.
3. Move current voice routing behind those contracts.
4. Correct preset preview to static playback and remove generation fallback from preview.
5. Introduce a local worker contract and job registry.
6. Add personal multi-device workers.
7. Add community worker opt-in and resource limits.
8. Add distributed cache/model distribution.
9. Add compute accounting after reliable scheduling exists.
10. Replace external fallbacks progressively as Little Red implementations mature.

## 13. Acceptance gates

A phase is not complete until:

- typecheck passes;
- lint/tests/build pass;
- capability routing has automated contract coverage;
- failure of an external provider does not break local paths;
- privacy scope is enforced by tests;
- Android APK is produced when Android changes are included;
- end-to-end user journeys are verified with real outputs.

For voice specifically, the acceptance test must distinguish static preset playback from generated speech and must verify that each preset points to the intended sample rather than a fallback voice.

## 14. First implementation slice

The first engineering slice is intentionally small: create the Engine/capability boundary and make the existing Buddy voice path use it without changing the user-facing UI. In parallel, repair preset sample mapping so the preview path is strictly playback-only. This establishes the architecture without attempting the entire community network in one change.
