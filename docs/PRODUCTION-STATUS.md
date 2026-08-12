# Production Status

The authoritative Studio is `GiggleLootCoin/little-reds-big-studio-f36b7ec4`.

The application is a mobile-first TanStack Start/React product with a Buddy-led
creative UI and a verified runtime layer for free/open execution. Supabase
account and entitlement state is authoritative on the server.

Cloudflare Workers is the production hosting target. The live Worker is:
`https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`

Validated foundations include:

- Android-first responsive Studio UI
- Android hands-free Buddy microphone loop
- Supabase authentication and server-authoritative entitlement checks
- Password recovery and account session refresh
- Live Gradio schema discovery and provider fallback
- Verified artifact extraction and delivery
- Free/open model routing without exposing provider machinery
- Cloudflare Worker production deployment

Important verification boundary:

A green build does not prove that every public GPU provider is available at the
same moment. Public free/ZeroGPU Spaces can sleep, rate-limit or change their
schemas. The runtime therefore checks compatibility, executes, validates the
returned artifact and fails over before reporting a successful generation.

The remaining production acceptance tests are live end-to-end Android artifact
runs for each major capability and live verification of the Buy Me a Coffee
webhook entitlement secret. Those tests require the deployed application and
external provider capacity; they are not represented as complete merely because
the code compiles.
