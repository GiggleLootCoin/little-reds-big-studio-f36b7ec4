# Little Red's Big Studio — Hermes Agent Knowledge Transfer

**Migrated:** 2026-09-03  
**From:** Hermes Agent session running in Termux on Android 12 (Samsung A12)  
**To:** `.studio-memory/` engineering handoff layer  
**Status:** Approved for commit — no secrets, tokens, or private credentials included.

---

## What this file is

This is the accumulated engineering knowledge from the Hermes Agent that has been assisting with LRBS development from an Android/Termux environment. It is NOT Buddy user memory. It is engineering context: architecture decisions, runtime constraints, integration topology, and verified facts that future agents (running in any environment) must know.

---

## Critical environment facts

### Device
- Primary development device: Samsung A12, Android 12.
- No desktop/laptop computer available. All development happens on-device via Termux or via GitHub.

### Termux Hermes installation
- Hermes runs inside Termux with Python 3.14.6.
- A patched `DaemonThreadPoolExecutor` is required for this Python version; the unpatched version causes hangs.
- Hermes gateway must remain running for cron jobs to function.
- The Hermes installation is backed up to external storage at:
  `/storage/emulated/0/HermesBackup-2026-09-03-030731`
  (646 files, ~37 MB, sha256-verified identical on 7 critical files.)

### Backup verification
- 7 critical files verified with sha256: `.hermes_history`, `MEMORY.md`, `USER.md`, `config.yaml`, `auth.json`, `SOUL.md`, `jobs.json`.
- All matched. Backup is restorable without Termux modification.

### Hermes ↔ GitHub connectivity
- GitHub CLI (`gh`) is authenticated in Termux as account `GiggleLootCoin`.
- Git protocol: HTTPS.
- The local clone at `~/studio-poc/little-reds-big-studio-f36b7ec4` has remote origin pointing to `https://github.com/GiggleLootCoin/little-reds-big-studio-f36b7ec4.git`.
- Push is not blocked in this environment (auth is present); verify before each push.
- Push in CI may still use `GITHUB_TOKEN` scoped to the workflow.
- **Never force-push to `main`** — Lovable sync is attached to this branch and rewrites history on their side.

---

## LRBS repository topology

### Canonical repository
- `GiggleLootCoin/little-reds-big-studio-f36b7ec4` is the single authoritative repository.
- A similarly-named older repository (`little-reds-big-studio-611db058`) exists and must not be treated as authoritative.
- `~/studio-poc/little-reds-big-studio` is a separate older local clone with a Lovable-era structure — not canonical.

### Local clone paths (Termux)
- `~/studio-poc/little-reds-big-studio-f36b7ec4` — canonical clone with full history, node_modules, and prior build artifacts.
- `~/migration-workspace/canonical-lrbs` — fresh shallow clone for inspection (no node_modules).

### Production
- URL: `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`
- Hosting: Cloudflare Workers (via `wrangler.jsonc`).
- Assets directory: `dist/client`; Worker entry: `dist/server/worker-wrapper.js`.
- Compatibility date: `2026-08-12`.
- Observability: enabled.
- Production deploys from `main` push via CI (`deploy-cloudflare.yml`).

---

## Architecture decisions frozen in this environment

### Free-only policy (DO NOT change)
- No mandatory paid AI API or provider account.
- No ElevenLabs, no Replicate, no Lovable dependency.
- All generation features must produce a validated artifact before claiming success.
- UI represents capabilities, not provider names.

### Buddy voice architecture (FROZEN — do not modify without explicit approval)
- `buddy/voice.py` was investigated and is **NOT approved — removed from scope**.
- Direct Pocket TTS CLI is the only approved TTS path in this environment.
- Voice model: `red_device10_C_english.safetensors` via the `red_pocket_tts_wrapper.sh` script.
- Voice samples export destination: `/storage/emulated/0/Music/`.
- `state_machine.transition()` must NOT increment turn counter; `loop.py` handles turn counting.
- Session persistence and Hermes `session_id` resume must be preserved.
- Voice cloning libraries (`voiceclonnx`, `chatterbox`) are unsupported on Android ONNX Runtime — use direct Pocket TTS only.

### Voice runtime in the web app
- Browser-side voice uses Web Speech API / MediaRecorder / explicit free-runner routes.
- `voiceclonnx` and `chatterbox` paths exist in `src/lib/` and `src/workers/` but are NOT functional on this device — do not claim they are production-verified on Android.

### Prerender stall on Android/Termux
- Vite prerender stalls in this environment with `Concurrency: 0`.
- Root cause is host thread-pool/worker detection on Android/Termux, not project code.
- Documented in a prior diagnostic; the workaround is to skip full prerender in development and use `vite preview` or Cloudflare deployment for the production bundle.

---

## Protected paths and files

- `~/studio-poc/pocket-tts-build/` — **PROTECTED.** Do not read, write, modify, delete, or execute any file inside this directory.
- `red_device10_C_english.safetensors` — treat as private model asset.
- `/storage/emulated/0/Music/` — user voice sample export destination; do not modify without explicit approval.

---

## Hermes ↔ Buddy integration points

### Hermes-side
- TTS provider config: `red-pocket` command provider calling `~/studio-poc/pocket-tts-build/voice-tests/red_pocket_tts_wrapper.sh {input_path} {output_path}`.
- Output format: `wav`, timeout: 600s.
- Ctrl+B must stop TTS immediately (keyboard interrupt path).
- Gateway process required; if gateway stops, cron jobs and background tasks stop.

### Buddy-side (`~/studio-poc/buddy/`)
- `loop.py` — main orchestration loop; increments turn count once per completed `run_once()`.
- `session.py` — Hermes session management; session_id resume required.
- `state_machine.py` — Buddy state machine; `transition()` does NOT increment turn.
- `stt.py` — speech-to-text via Web Speech API or Whisper-compatible route.
- `tts.py` — approved TTS path (Pocket TTS CLI only).
- `config.py` — mic source=5 (CAMCORDER) hardcoded; bottom mic is non-functional on this device.
- `playback.py` — audio playback control.
- `main.py` / `__main__.py` — entry points.

### Buddy test suite
- `buddy/tests/test_loop.py`, `test_state_machine.py`, `test_tts.py`, `test_stt.py`, `test_playback.py`, `test_hermes_client.py`, `test_main.py`, `test_config.py`.
- pytest 9.1.1 is installed in this environment.

---

## Android app strategy (APK)

### Selected architecture: Trusted Web Activity (TWA) via Bubblewrap

**Why TWA:**
- Wraps the existing production Cloudflare Workers URL as a native Android APK.
- No server-side changes required; the production backend stays untouched.
- Preserves all existing IndexedDB/localStorage project data.
- No Lovable dependency.
- ARM64-only target (Samsung A12).
- Rebuilds are CI-driven; APK artifact is downloadable.

**Why NOT a full native rewrite:**
- The web app already works on Android Chrome; wrapping it avoids duplicating thousands of lines of UI and Buddy logic.
- Bubblewrap generates a minimal Play-store-ready APK from an existing HTTPS origin.
- Upgrades are atomic: install new APK, browser state survives.

**Why NOT Capacitor/Cordova:**
- Adds a WebView dependency and larger binary. TWA is smaller and uses Chrome's full rendering engine.

**APK build path:**
- Use GitHub Actions with `bubblewrap` (Google's TWA tool) and JDK 21.
- Steps: install JDK 21 → install Bubblewrap → `bubblewrap init --manifest` with LRBS manifest → `bubblewrap build` → upload APK artifact.
- The TWA manifest will point to `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`.
- Launcher icon: extracted from `public/logo.svg`.

**Secrets handling:**
- Bubblewrap signing key stored as GitHub Actions secret (`TWA_SIGNING_KEY_BASE64`).
- Never committed to repository.

**Upgrade path:**
- Increment `versionCode` and `versionName` in the TWA manifest for each build.
- Existing installs update via standard APK replacement; local data survives.

**What remains dependent on Termux (temporary):**
- Building the APK artifact requires a CI environment with JDK 21 + Bubblewrap. This cannot run on this phone without Termux.
- Pocket TTS CLI is not available in the APK context; the web app's existing browser speech/TTS routes are used instead.
- Hermes gateway/cron jobs require a separate Hermes process; the APK is the LRBS web app wrapper, not the Hermes agent itself.

---

## CI/CD notes

### Existing GitHub Actions workflows
- `.github/workflows/free-validation.yml` — TypeScript, lint, audio/voice tests on PR/push to main.
- `.github/workflows/security-quality.yml` — typecheck + format + lint.
- `.github/workflows/deploy-cloudflare.yml` — production deploy on main push.
- `.github/workflows/free-open-agentic-validate.yml` — dependency lockfile validation.
- `.github/workflows/official-station-contract.yml` — contract tests for official stations.

### Deploy triggers present in repo
- `.github/deploy-trigger-2026-09-03*.txt` — 4 trigger files for deployment verification.
- These should not be removed without checking if they are referenced by CI.

---

## Open verification gaps (pre-existing in repo)
1. Membership webhook (`BMAC_WEBHOOK_SECRET`) not independently verified from repository.
2. Android runtime smoke test (sign-in, mic, Buddy loop, generation artifact) not yet performed in CI.
3. Free public AI route health must be determined at runtime; they are provisional.

---

## Hermes safety constraints carried forward

- Read-only first; show exact commands before state changes.
- Never overwrite, move, or delete without explicit OK.
- Always use new timestamped filenames for generated artifacts.
- No installs, settings changes, or cache modifications without OK.
- Timed recordings use recorder limit, not sleep loops.
- Exact line-level static traces required for code analysis.

---

## Migration status

| Phase | Item | Status |
|-------|------|--------|
| 1 | Full Hermes backup to external storage | ✅ Done |
| 1 | sha256 verification of 7 critical files | ✅ All matched |
| 1 | 646 files, 37 MB at `/storage/emulated/0/HermesBackup-2026-09-03-030731` | ✅ |
| 2 | Project knowledge migrated to `.studio-memory/HERMES_KNOWLEDGE_MIGRATION.md` | ✅ This file |
| 2 | Secrets excluded from public repo | ✅ No tokens/keys included |
| 3 | APK architecture selected (TWA via Bubblewrap) | ✅ Selected |
| 3 | TWA manifest scaffold added | ✅ Pending commit |
| 4 | GitHub connectivity verified | ✅ `gh auth status` confirmed |
| 5 | Migration report | ⏳ After commit + verification |
