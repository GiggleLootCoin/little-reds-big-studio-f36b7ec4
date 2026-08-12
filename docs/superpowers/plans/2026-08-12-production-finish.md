# Production Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Little Red's Big Studio from a production-oriented shell into a verifiably usable mobile-first creative studio by closing the real voice, authentication, generation, artifact, visual, and deployment gaps without fake success states.

**Architecture:** Keep Buddy as the single capability-facing front door. Strengthen the browser voice layer with explicit microphone discovery/permission recovery and three composer modes (Live Call, Record→Text, Type), while keeping provider/model selection behind `studio-runtime.ts`. Strengthen runtime validation so media jobs cannot report success without a real playable artifact, and record verification evidence in `.studio-memory`.

**Tech Stack:** TanStack Start, React 19, TypeScript, Vite, Cloudflare Workers, Supabase, `@gradio/client`, Hugging Face public Gradio Spaces, Tailwind CSS.

## Global Constraints

- Android/mobile-first; no computer required for normal use.
- Free/open-first; no mandatory paid AI API or provider account.
- Provider/model names remain backstage.
- Never report generation success without compatible execution, returned artifact, and validation.
- Voice cloning/conversion requires user authorization for the source voice.
- Browser/OS microphone permission cannot be bypassed; failures must be distinguished from device-selection failures and recovered where possible.
- Preserve existing validated infrastructure and the authoritative repository `GiggleLootCoin/little-reds-big-studio-f36b7ec4`.

---

### Task 1: Correct project state and verification record

**Files:**

- Modify: `.studio-memory/CURRENT-STATE.md`
- Modify: `.studio-memory/CHANGELOG.md`
- Modify: `.studio-memory/KNOWN-ISSUES.md`

- [ ] Record `main` as `d0dda5645481bcc6b093cf50924b621d10854bf1` and note that the memory layer is already merged.
- [ ] Add the newly agreed voice UX acceptance criteria: one Live Chat button, Record→Text, Type, automatic input-device selection, natural turn-taking, and animated Buddy state.
- [ ] Keep unresolved external verification items explicitly marked unresolved rather than claiming them complete.
- [ ] Record the inspected Hugging Face route health evidence without treating metadata as execution proof.
- [ ] Commit the state update.

---

### Task 2: Production microphone/device layer

**Files:**

- Create: `src/lib/microphone.ts`
- Modify: `src/components/studio/BuddyLiveChat.tsx`

**Interfaces:**

- `listMicrophones(): Promise<MediaDeviceInfo[]>`
- `chooseMicrophone(devices: MediaDeviceInfo[]): MediaDeviceInfo | null`
- `requestMicrophone(deviceId?: string): Promise<MediaStream>`
- `stopMicrophone(stream: MediaStream | null): void`
- `describeMicrophoneError(error: unknown): string`

- [ ] Add failing tests for device preference, permission error classification, and graceful absence of `enumerateDevices`/`getUserMedia`.
- [ ] Enumerate `audioinput` devices after permission is granted and listen for `devicechange`.
- [ ] Prefer a non-default active input when available, then fall back to `default`.
- [ ] Request `echoCancellation`, `noiseSuppression`, and `autoGainControl` where supported.
- [ ] Surface a specific recovery message for denied permission, insecure context, missing input device, and browser API absence.
- [ ] Never label an input permanently “blocked” merely because one device failed.
- [ ] Add a small microphone selector only when multiple usable inputs exist; keep it out of the normal path when one input works.
- [ ] Commit the microphone layer.

---

### Task 3: Phone-call-style Buddy interaction

**Files:**

- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/components/studio/BuddyPresence.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Live session states: `idle | connecting | listening | thinking | speaking | error`.
- Composer modes: `live | record | type`.

- [ ] Replace the current “hands-free panel” interaction with a single prominent Live Chat action while retaining Type and Record→Text.
- [ ] Keep the live loop as `mic → STT → Buddy → TTS → mic`.
- [ ] Stop/restart listening around Buddy speech to avoid feedback.
- [ ] Support barge-in by stopping Buddy audio when user speech is detected.
- [ ] Keep the existing free/open runtime fallback behavior.
- [ ] Animate the real Buddy reference image differently for listening, thinking, speaking and idle states.
- [ ] Add call controls for mute and end call without adding unnecessary controls.
- [ ] Persist the transcript through the existing project/account memory layer rather than only localStorage when authenticated.
- [ ] Commit the voice UX.

---

### Task 4: Record→Text and voice-clone capture

**Files:**

- Modify: `src/components/studio/BuddyLiveChat.tsx`
- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Create: `src/components/studio/VoiceProfilePanel.tsx`

- [ ] Add a record-to-text action that records until stop, sends the actual audio blob to `speech-to-text`, displays editable transcription, and only sends after user confirmation.
- [ ] Add an in-app voice sample recorder for the user's own voice.
- [ ] Add upload fallback for an existing authorized sample.
- [ ] Send the actual sample to `voice-clone` and require a returned media artifact before saving the voice profile.
- [ ] Persist voice profile metadata separately from engineering memory.
- [ ] Add explicit user-authorization confirmation for cloning/converting a supplied voice.
- [ ] Commit the voice-profile workflow.

---

### Task 5: Generation controls and artifact handling

**Files:**

- Modify: `src/components/studio/FreeCreatePanel.tsx`
- Modify: `src/lib/studio-runtime.ts`

- [ ] Separate lyrics, music, image, video, stems, voice clone, and voice swap controls clearly without exposing providers.
- [ ] For every media capability, validate a playable URL/blob and reject text-only or empty results.
- [ ] Render the correct player/viewer for image, audio, and video artifacts.
- [ ] Preserve source audio and reference voice together for voice-swap jobs.
- [ ] Add explicit processing status and fallback status without claiming completion prematurely.
- [ ] Ensure failed providers do not poison the next fallback attempt with stale endpoint data.
- [ ] Add bounded timeout and cancellation behavior for long jobs.
- [ ] Commit the generation hardening.

---

### Task 6: Authentication and persistent user state

**Files:**

- Modify: `src/routes/auth.tsx`
- Modify: relevant Supabase/auth helper files discovered during implementation.
- Modify: relevant project-memory persistence files discovered during implementation.

- [ ] Verify sign-up, sign-in, sign-out, refresh and password recovery paths against the current Supabase integration.
- [ ] Keep entitlements server-authoritative.
- [ ] Store Buddy user/project memory separately from engineering `.studio-memory`.
- [ ] Ensure authenticated sessions do not silently fall back to anonymous local-only state for durable project data.
- [ ] Commit authentication/persistence fixes.

---

### Task 7: Visual polish and responsive Buddy presentation

**Files:**

- Modify: `src/routes/index.tsx`
- Modify: `src/components/studio/BuddyWelcome.tsx`
- Modify: `src/components/studio/StudioLogo.tsx`
- Modify: `src/styles.css`

- [ ] Preserve the approved Little Red crimson/obsidian/glass visual identity while reducing visual clutter.
- [ ] Make Buddy the visual focal point without making the dashboard feel like a template.
- [ ] Use the repository's approved Buddy reference asset rather than inventing a replacement character.
- [ ] Improve mobile spacing, touch targets, hierarchy, and call presentation.
- [ ] Keep the real Studio logo visible and self-contained.
- [ ] Add subtle state-reactive Buddy animation rather than decorative motion everywhere.
- [ ] Commit the visual polish.

---

### Task 8: Production verification gate

**Files:**

- Modify: `.studio-memory/CURRENT-STATE.md`
- Modify: `.studio-memory/KNOWN-ISSUES.md`
- Modify: `.studio-memory/DEPLOYMENT.md`

- [ ] Run TypeScript, lint, formatting check, and production build in CI.
- [ ] Verify the deployed production revision corresponds to the validated main commit.
- [ ] Verify the public Hugging Face route metadata for every configured primary/fallback family before calling a route healthy.
- [ ] Execute real artifact tests for at least one image, one song/music output, one voice/TTS output, one speech-to-text output, one stem output, and one video output where the public free route permits execution.
- [ ] Execute a real RVC/voice-conversion test with an authorized test voice and confirm a playable converted artifact.
- [ ] Execute Android smoke testing for sign-in, microphone permission/device selection, Live Chat, Record→Text, and one real generation artifact.
- [ ] If a provider cannot be executed because of public queue/quota/outage, record the exact blocker and keep a verified fallback rather than claiming success.
- [ ] Record exact evidence, commit SHA, production URL and remaining external blockers in project memory.

---

## Acceptance Gate

The Studio is only called finished when every exposed control has a real execution path and no fake success state; authentication persists correctly; Buddy voice interaction works on a supported mobile browser; media jobs return validated usable artifacts; RVC/voice conversion has a real tested output; and CI/deployment evidence is recorded. External browser/OS permission denials and third-party provider outages are reported honestly and never disguised as application success.
