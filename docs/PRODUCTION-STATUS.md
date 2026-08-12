# Production Status

The authoritative Studio is `GiggleLootCoin/little-reds-big-studio-f36b7ec4`.

The application uses the Lovable/TanStack UI as the product shell and a verified runtime layer for free/open execution, with Supabase account and entitlement state authoritative on the server.

Runtime validation is performed by GitHub Actions before release changes are merged. Current code has passed type-check after the Gradio 2.x runtime fix; the next run must clear formatting, lint and production build before release sign-off.
