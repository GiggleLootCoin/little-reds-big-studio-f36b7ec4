# Production Status

The authoritative Studio is `GiggleLootCoin/little-reds-big-studio-f36b7ec4`.

The application uses the Lovable/TanStack UI as the product shell and a
verified runtime layer for free/open execution, with Supabase account and
entitlement state authoritative on the server.

The latest GitHub validation completed successfully: dependency install,
TypeScript type-check, formatting, lint and production build all passed. The
creation surface now also accepts source audio and a reference voice for
supported voice-swap/stem routes.

Validated foundations include:

- Android hands-free Buddy microphone loop
- Supabase authentication and server-authoritative entitlement checks
- Live Gradio schema discovery and provider fallback
- Verified artifact extraction and delivery
- Free/open model routing without exposing provider machinery
