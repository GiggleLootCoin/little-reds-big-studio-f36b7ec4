# Buddy + Studio Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the already-deployed Studio into a reliable Android-first creative product with real Buddy conversation, hands-free input, multimodal attachments, and validated real generation paths.

**Architecture:** Keep one persistent Buddy conversation state and make input modes interchangeable. Put provider-specific contracts behind the existing Studio runtime, with server-side Cloudflare routes for low-latency/key-protected capabilities and explicit Hugging Face fallbacks only where their live APIs are verified. A result is successful only after artifact validation.

**Tech Stack:** React + TypeScript, Cloudflare Workers/Workers AI, @gradio/client, browser MediaDevices/MediaRecorder/SpeechRecognition, existing localStorage project state, GitHub Actions.

## Global Constraints

- Android-first; no desktop dependency.
- Free/open providers first; paid services are fallbacks only when already configured.
- Never expose private provider credentials in client code.
- Users do not choose AI models for ordinary Buddy chat.
- Hands-free must work with the Android built-in microphone when browser permissions permit it.
- Mode switching must preserve the same conversation.
- No feature reports success without a real usable result.
- Do not add unrelated billing or speculative finance features.

---

### Task 1: Make Buddy conversation state multimodal

**Files:**
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Create: `src/lib/buddy-conversation.ts`

**Interfaces:**
- `BuddyAttachment`: `{ id:string; name:string; type:string; size:number; blob?:Blob; url?:string; status:"ready"|"processing"|"error" }`
- `BuddyMessage`: `{ id:string; role:"user"|"assistant"; content:string; createdAt:number; attachments:BuddyAttachment[] }`
- `sendBuddyMessage(message: BuddyMessage, history: BuddyMessage[]): Promise<{text:string; audioUrl?:string}>`

- [ ] Extract message persistence/normalization into `buddy-conversation.ts`.
- [ ] Preserve the last 50 messages and strip non-serializable Blob objects before localStorage persistence.
- [ ] Add attachment metadata to every message without breaking old stored messages.
- [ ] Make typed and voice messages call the same send path.
- [ ] Verify reload restores conversation context without crashing on old state.
- [ ] Commit `feat: unify Buddy multimodal conversation state`.

### Task 2: Finish Android microphone and hands-free loop

**Files:**
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/lib/microphone.ts`

**Interfaces:**
- `beginCapture("live"|"record"): Promise<void>` uses browser SpeechRecognition first only when available, otherwise MediaRecorder + real STT.
- `stopCapture(): void` stops recognition, recorder and tracks without losing transcript.

- [ ] Add explicit mic permission/request status and a visible built-in-mic default option.
- [ ] Do not require a selected `deviceId` for default Android capture.
- [ ] Keep Buddy's speaker output from being transcribed by pausing recognition during playback.
- [ ] Automatically restart hands-free recognition after Buddy finishes speaking.
- [ ] Add recovery for `not-allowed`, `no-speech`, `audio-capture`, and `network` recognition errors.
- [ ] Ensure a failed SpeechRecognition start falls back to MediaRecorder instead of stopping.
- [ ] Verify cleanup on mode switch/unmount.
- [ ] Commit `fix: make Buddy hands-free resilient on Android`.

### Task 3: Add attachment picker and multimodal send pipeline

**Files:**
- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Create: `src/lib/buddy-attachments.ts`
- Modify: relevant server chat route discovered during implementation

**Interfaces:**
- `acceptAttachment(file: File): Promise<BuddyAttachment>` validates size/type and creates a preview/object URL.
- `prepareAttachments(files: File[]): Promise<BuddyAttachment[]>` returns ready metadata plus original Blob references for the active message.

- [ ] Add Android file/gallery/camera-compatible file input for images, audio, video, and common documents.
- [ ] Allow multiple attachments per message.
- [ ] Show removable previews before sending.
- [ ] Send actual Blob/File data through the supported server/provider path, not filenames alone.
- [ ] Add image preview and audio/video playback controls.
- [ ] Preserve unsupported files as downloadable attachments with a clear unsupported-analysis message.
- [ ] Enforce a practical mobile size limit and show it before upload.
- [ ] Revoke object URLs when attachments are removed/unmounted.
- [ ] Commit `feat: add multimodal Buddy attachments`.

### Task 4: Make chat responses real and context-aware

**Files:**
- Modify: current chat server route
- Modify: `src/lib/studio-runtime.ts`
- Modify: `src/lib/free-runners.ts`

**Interfaces:**
- Chat adapter accepts `{messages, attachments}` and returns `{text}`.

- [ ] Inspect the existing Cloudflare chat route and ensure it accepts conversation history.
- [ ] Pass the persistent Buddy history rather than only the latest prompt.
- [ ] Add a safe server-side fallback when Cloudflare chat is unavailable.
- [ ] Keep provider/model selection invisible in ordinary UI.
- [ ] Return useful errors after all providers fail.
- [ ] Validate non-empty text before reporting success.
- [ ] Commit `fix: make Buddy conversation responses persistent and real`.

### Task 5: Harden TTS/STT as explicit capability adapters

**Files:**
- Modify: `src/lib/studio-runtime.ts`
- Modify: existing `/api/ai/tts` and `/api/ai/*` routes
- Modify: `src/lib/free-runners.ts`

- [ ] Keep MeloTTS as preferred route.
- [ ] Treat Cloudflare capacity `3040` as retry/fallback, not permanent failure.
- [ ] Use Aura-1 only as a server-side fallback when available.
- [ ] Prevent normal TTS from requiring `ref_audio`.
- [ ] Keep voice cloning as a separate capability requiring user-supplied/reference audio.
- [ ] Validate audio MIME/size before returning success.
- [ ] Make STT fallback ordering explicit and reject providers whose live schema cannot be loaded.
- [ ] Commit `fix: harden Buddy speech capability fallbacks`.

### Task 6: Make every creative generation control map to a real capability

**Files:**
- Modify: `src/lib/free-runners.ts`
- Modify: `src/lib/studio-runtime.ts`
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Modify: relevant server routes

- [ ] Audit every generation button against `runnersFor(capability)`.
- [ ] Ensure image uses a real server-side image route first.
- [ ] Ensure music has at least two real providers with compatible input contracts.
- [ ] Ensure video and image-to-video use distinct contracts and don't send text-only payloads to I2V endpoints.
- [ ] Ensure voice conversion requires source audio and target voice data.
- [ ] Ensure stem separation requires an audio input and returns actual stems.
- [ ] Reject empty URLs, empty Blobs, and placeholder JSON as successful artifacts.
- [ ] Add a common generation progress/error display in the creation panel.
- [ ] Commit `fix: make creative generation routes capability-specific and verifiable`.

### Task 7: Add generated artifact history and safe reuse

**Files:**
- Create: `src/lib/artifact-history.ts`
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Modify: Buddy chat UI as needed

- [ ] Persist generated artifact metadata locally with project association.
- [ ] Add reuse action that feeds an image/audio/video artifact into compatible next-generation controls.
- [ ] Add download/share actions using browser-supported Web Share API with download fallback.
- [ ] Do not persist huge binary payloads in localStorage; retain URL/reference metadata only.
- [ ] Commit `feat: add generated artifact history and reuse`.

### Task 8: Final security, mobile UX, and reliability audit

**Files:**
- Audit all `src/**`, `functions/**`, `wrangler.jsonc`, `.github/workflows/**`, and package scripts.
- Modify only files with a verified issue.

- [ ] Search for exposed secrets, hard-coded API tokens, unsafe URL construction, and accidental provider-key logging.
- [ ] Search for dead buttons, placeholder handlers, `TODO`/`FIXME` blockers, fake success states, and unhandled rejected promises in user-facing flows.
- [ ] Audit mobile touch targets, overflow, viewport behavior, keyboard handling, and permission messaging.
- [ ] Audit localStorage parsing/version migration and recovery after malformed state.
- [ ] Audit accessibility labels for microphone, recording, send, attach, mute, and generation controls.
- [ ] If a missing feature materially blocks the Studio's stated purpose, document what it is and why; add it only if low-risk and directly in scope.
- [ ] Commit `chore: complete final production audit and hardening`.

### Task 9: Production verification gate

**Files:**
- Modify tests/workflow only when an actual gap is found.

- [ ] Run TypeScript check.
- [ ] Run Prettier check.
- [ ] Run ESLint.
- [ ] Run production build.
- [ ] Deploy through the existing Cloudflare workflow.
- [ ] Confirm production smoke test is HTTP 200 and contains Studio content.
- [ ] Verify live typed Buddy response + speech.
- [ ] Verify live hands-free with Android built-in mic and no external mic.
- [ ] Verify push-to-talk transcription.
- [ ] Verify attachment send path.
- [ ] Verify at least one real image, music, and video generation path returns usable artifacts.
- [ ] Verify TTS fallback under provider failure does not leave Buddy silent.
- [ ] Report any intentionally unsupported capability rather than calling it complete.
- [ ] Commit only verified fixes; do not claim completion from CI alone.
