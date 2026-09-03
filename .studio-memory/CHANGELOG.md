# Studio Memory Changelog

## 2026-09-03

- Added `.studio-memory/HERMES_KNOWLEDGE_MIGRATION.md` with accumulated Hermes engineering context: device constraints, backup path, Buddy voice architecture, protected paths, Android APK strategy (TWA via Bubblewrap), CI/CD topology, and Hermes ↔ GitHub connectivity.
- Added `twa/twa-manifest.json` + `twa/launcher-icon.svg` for TWA APK generation.
- Added `.github/workflows/build-apk.yml` (Bubblewrap + JDK 21 CI for ARM64 APK).
- Verified Hermes installation backed up to `/storage/emulated/0/HermesBackup-2026-09-03-030731` (646 files, ~37 MB, sha256-verified).
- Confirmed GitHub CLI authenticated as `GiggleLootCoin`; push connectivity verified.

## 2026-08-12

- Established `.studio-memory/` as the permanent engineering handoff layer.
- Confirmed `little-reds-big-studio-f36b7ec4` as authoritative repository.
- Recorded current main at `0b89d9928c2e7aec2596f890d1a21125570e6b12`.
- Recorded Cloudflare Workers production authority and current documented URL.
- Recorded Buddy orchestration, free/open route policy and artifact validation rule.
- Recorded remaining membership-webhook and Android-runtime verification gaps.
- Recorded the separation between development memory and Buddy/user memory.

## Historical milestones

- Production integration added Buddy runtime, authentication, entitlement handling, free execution routing and artifact validation.
- Production AI pool expanded for image, video and lyrics.
- Cloudflare production deployment hardened.
- Studio shell and Buddy hero branding made responsive/self-contained.

