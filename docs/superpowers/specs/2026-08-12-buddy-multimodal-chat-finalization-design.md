# Buddy Multimodal Chat + Final Production Audit Design

## Goal

Make Buddy a reliable, Android-first multimodal conversation hub and finish the Studio with a final production audit. Users can switch freely among text, hands-free voice, push-to-talk/recorded voice, and attachments without losing conversation context. Creative generation controls must invoke real providers and only report success when a usable artifact exists.

## Current context

The production repository is `GiggleLootCoin/little-reds-big-studio-f36b7ec4`. Recent production work has made typed Buddy speech work and the deployment pipeline green. The remaining risk is feature-level reliability: hands-free input, multimodal attachments, provider routing, and end-to-end generation verification.

## Design

### 1. Unified Buddy conversation model

Each message contains role, text, timestamp, optional voice metadata, and zero or more attachments. Attachments retain MIME type, filename, size, local/object URL as appropriate, and processing status. Conversation state survives switching input modes and is persisted locally within sensible limits.

### 2. Input modes

- Text chat: normal typed messages.
- Hands-free: Android built-in/default microphone first; speech recognition or recorded-audio STT fallback; automatic response and TTS loop.
- Push-to-talk/record: explicit start/stop recording, transcription preview, editable transcript, then send.
- Attachment-first: send image/audio/video/document with optional text.
- Camera/gallery/file picker: use Android-native browser capabilities without requiring a computer.

Mode changes never create a new conversation and never discard existing messages.

### 3. Hands-free reliability

Do not rely on a selected physical `deviceId` for the default path. Use Android/browser default input first. If browser SpeechRecognition is unavailable or unreliable, capture the default MediaStream with MediaRecorder and send the audio to a real STT provider. During TTS playback, prevent recognition from transcribing Buddy's own voice; restart listening after playback. Permission failures must explain exactly what the user needs to change. A live status is shown only when capture is actually active.

### 4. Multimodal processing

Buddy receives actual attachment bytes/blob references through the appropriate application path, not only filenames. Images are available for vision-capable reasoning; audio can be transcribed/analyzed; video and documents use supported extraction/analysis paths. Unsupported formats receive a clear explanation and remain available as downloadable attachments rather than disappearing.

### 5. Provider architecture

Use capability-specific adapters and explicit input/output contracts for chat, STT, TTS, image, music, video, image-to-video, voice cloning/conversion, and separation. Each capability has a primary provider and ordered fallbacks. Provider-specific schemas are never guessed across unrelated capabilities. Capacity errors, unavailable Spaces, timeouts, malformed responses, and empty artifacts trigger fallback when safe.

### 6. Real generation contract

A generation operation is successful only if the response contains a usable media artifact matching the requested capability. Validate MIME/type, non-zero size or resolvable URL, and playback/display readiness where practical. Store generated artifacts in the conversation/project history with a clear provider/source label internally, while keeping provider complexity hidden from normal users.

### 7. Buddy personality and continuity

Buddy uses one conversation context regardless of input mode. It should remember the current project/conversation and relevant user-provided attachments. Provider changes must not reset the visible conversation. The UI should not require users to choose an AI model for ordinary chat.

### 8. Final audit and missing-feature sweep

Before calling the Studio finished, audit:

- authentication/session behavior if present;
- persistence and recovery after reload;
- mobile responsiveness and touch targets;
- microphone/camera/file permissions;
- attachment size/type handling;
- generated artifact playback/download/share;
- provider timeouts and fallbacks;
- error messages and loading states;
- empty states and retry behavior;
- accessibility labels/focus/keyboard behavior;
- security and secret exposure;
- Cloudflare Worker routes and production environment variables;
- dead buttons, placeholder/demo paths, console errors, and broken links;
- duplicate/obsolete provider registrations;
- CI/build/lint/typecheck and production smoke tests.

During the audit, if a missing feature materially blocks the Studio's stated purpose or makes an existing feature misleading, document it with reason and either add it if low-risk and in scope or flag it for user approval before expanding scope. Do not silently add unrelated features.

## Testing / acceptance criteria

1. Typed Buddy message produces a real AI response and optional spoken response.
2. Hands-free works on Android using the built-in phone microphone with no external microphone attached.
3. Push-to-talk/recorded voice works and permits transcript editing before send.
4. Switching modes preserves the same conversation.
5. Image/audio/video/document attachments can be added to messages and are actually processed where supported.
6. Image, music, video, TTS, and voice-generation actions return real usable artifacts or a truthful provider-specific failure after fallbacks are exhausted.
7. Buddy can reference a previous generated artifact without requiring a new upload when it remains available in the conversation/project.
8. Provider failures do not leave the UI stuck in a false success/loading state.
9. No client bundle contains private provider secrets.
10. TypeScript, lint, formatting, production build, deployment, and smoke tests all pass.
11. Final audit reports any intentionally unsupported capability rather than presenting it as functional.

## Out of scope for this pass

Billing, paid tiers, speculative financial features, and unrelated visual redesigns are excluded unless an existing implementation makes a targeted correction necessary for usability or correctness.
