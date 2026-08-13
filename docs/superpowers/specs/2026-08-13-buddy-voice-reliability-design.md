# Buddy Voice Reliability Design

## Goal
Make Buddy voice interaction reliable on Android phones without a headset, while preserving typed chat and keeping the interface simple for ordinary users.

## User modes
1. **Tap to Talk** — tap Record, grant Chrome microphone permission when prompted, speak for an arbitrary practical duration, tap Stop, transcribe the complete recording, send it to Buddy, display the response, and speak the response when voice output is enabled.
2. **Hold to Talk** — press and hold to record; releasing ends the recording and follows the same pipeline.
3. **Live Hands-Free** — explicitly start a session; Buddy listens for turns, detects pauses locally when possible, sends each completed turn, speaks the response, then resumes listening. End Buddy terminates the session.

Tap to Talk is the reliability baseline. Live mode must never be required for basic voice use.

## Microphone and permission behavior
- Use HTTPS `getUserMedia({audio})` as the primary microphone acquisition path.
- Request permission from an explicit user gesture rather than on page load.
- After permission, enumerate available `audioinput` devices and default to the browser/OS default input.
- Permit optional microphone selection when multiple inputs are exposed.
- Never silently pretend that recording is active when no live audio track exists.
- Provide actionable permission, insecure-context, unsupported-browser, and no-device messages.
- Do not depend on the Web Speech Recognition API for the core recording path.

## Audio pipeline
`Android/Browser microphone -> MediaRecorder -> complete audio Blob -> speech-to-text job -> Buddy chat job -> text response -> TTS job -> HTMLAudioElement/speechSynthesis fallback`.

The recording path must not impose a ten-minute application-level cutoff. Long recordings should be bounded only by practical browser/device resource limits. The UI should show elapsed recording time and allow the user to stop manually. If a platform limit is encountered, preserve the recorded portion and return it instead of silently discarding it.

## Response reliability
- A voice turn is not complete until Buddy's text response is non-empty.
- A TTS failure must not erase the text response.
- If the preferred TTS route fails, use the existing browser speech-synthesis fallback where available.
- Live mode pauses microphone capture while Buddy is speaking to avoid feedback and accidental self-transcription, then resumes.
- Network/provider failures surface a concise user-facing retry message while retaining the user's transcribed message in the conversation.

## User experience
- Buddy remains at the top of the Studio home experience.
- The primary controls are visually obvious: Call Buddy, Record/Stop, and text Send.
- Status is human-readable: Opening microphone, Listening, Transcribing, Thinking, Speaking, Ready, or an actionable error.
- Provider/model names are not exposed in the normal UI.
- Technical diagnostics can be available separately for developer/admin use.

## Languages and voices
- Default language is automatic/browser-language aware where supported.
- User may select Buddy voice, including available male/female voice profiles and cloned voice profiles when configured.
- User may select or auto-detect supported conversation languages.
- The voice pipeline passes language and voice preferences through the TTS boundary without coupling the UI to a specific provider.

## Testing and acceptance criteria
- Android Chrome on the target phone can grant microphone permission and record using the built-in phone microphone with no headset connected.
- Tap-to-Talk produces a complete transcript and a real Buddy response.
- Buddy's response is audible through the phone speaker when voice output is enabled.
- A denied microphone permission produces a clear recovery instruction.
- Switching between phone/default and another exposed microphone works without requiring a reload.
- A recording longer than ten minutes is not intentionally truncated by Buddy's application logic.
- Live mode can perform multiple user/assistant turns without requiring a new page or chat.
- Text chat continues to work if microphone or TTS is unavailable.
- TTS failure preserves the text response and falls back where possible.
- No provider/model implementation details are required for normal users.
