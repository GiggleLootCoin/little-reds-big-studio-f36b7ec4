# Handoff Protocol

## For every new AI/coding session
1. Identify `GiggleLootCoin/little-reds-big-studio-f36b7ec4` as authoritative.
2. Read `.studio-memory/CURRENT-STATE.md` first.
3. Read the remaining `.studio-memory/*.md` files before changing architecture.
4. Inspect the actual current `main` commit; never rely on an old conversation commit hash.
5. Verify claims against repository files, CI and live behavior where possible.
6. Do not redo completed work simply because an older chat says it was unfinished.
7. Do not resurrect known dead ends recorded in `KNOWN-ISSUES.md` or `DECISIONS.md`.
8. After meaningful work, update the memory files with exact commit/test evidence.

## For Buddy itself
Buddy's persistent memory must be account/project backed and independent of engineering memory. It should preserve relevant context across new conversations and devices while respecting user-controlled memory and not inventing facts. Conversations are inputs to memory, not the memory store itself.

## Completion standard
"Finished" means the feature is actually usable, not merely rendered. For generation features this means request -> execution -> artifact -> validation. For hands-free Buddy this means microphone permission -> capture -> speech recognition -> orchestration -> response/TTS path. For authentication this means real session behavior. For membership this means server-side entitlement plus verified signed webhook flow.
