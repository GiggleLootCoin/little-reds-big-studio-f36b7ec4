# Little Red's Big Studio — Independent Comparison Build

This branch is a deliberately separate implementation for side-by-side testing against the main Studio.

## Design priorities

1. Local-first Buddy brain when the GGUF is installed.
2. Native Android microphone and audio path.
3. Red voice remains the preferred response voice.
4. Online providers are fallbacks/tools, not the foundation.
5. Keep the APK installable beside the main Studio using a separate application ID.
6. Favor explicit failures and visible provider state over silent fallback behavior.

This build is experimental and is intentionally not merged into the main Studio until the two versions are compared on the Galaxy A12.
