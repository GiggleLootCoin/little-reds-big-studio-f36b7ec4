# Little Red's Big Studio — MASTER SPEC

## Mission

Create one seamless creative studio for musicians and YouTubers. Buddy is the front door: users bring an idea, song, voice, artwork or project and Buddy orchestrates the best available route without exposing provider machinery.

## Core capabilities

Music generation; lyrics; vocal cloning; vocal swapping/voice conversion; RVC/Applio workflows; covers; image generation/editing/outpainting; character consistency; avatars; image-to-video; music-video generation; lip sync; audio/video editing; AI-assisted prompting; project management; persistent project context; exports.

## Buddy

Buddy is a persistent assistant, not a disposable chat persona. Relevant memory belongs to the account/project and survives new conversations/devices. Development memory is separate from user memory. Buddy must distinguish creative context from verified facts and must not fabricate memory.

## UX

Mobile/Android-first, responsive, visually premium, cinematic glass/crimson/obsidian identity. Keep model/provider details backstage. Hands-free microphone interaction is a first-class Android feature. Generation controls must represent real capabilities and report honest status.

## Execution policy

Use free/open routes first. Browser-local execution is used when genuinely available. Heavy work may use public free/open runners. Every remote route is provisional until schema compatibility, successful execution, artifact return and artifact validation are demonstrated. Fail gracefully and use fallbacks rather than fake success.

## Data boundaries

- Development memory: repository architecture, code, decisions, failures, deployment and provider state.
- Buddy memory: user Creative DNA, preferences, projects, conversations, explicit memories and uploaded project context.
- Never mix the two databases conceptually or expose engineering/provider machinery as user-facing memory.

## Product truth

The Studio must never claim an output exists when it only produced a placeholder, job ID, unverified URL, or failed request. Artifact validation is mandatory before success state.

## Cost

Target $0 hosting and no mandatory paid AI API/provider account. Paid membership target is separate from the free/open creative execution policy.
