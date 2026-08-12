# Little Red's Big Studio — deployment policy

Little Red's Big Studio is an independent Android-first web application. The Studio is not a Lovable runtime and must not depend on Lovable to build, run, or deploy.

## Current production deployment

The authoritative application repository is:

- `GiggleLootCoin/little-reds-big-studio-f36b7ec4`
- production branch: `main`
- runtime: Cloudflare Workers
- Worker name: `little-reds-big-studio-f36b7ec4`
- production URL: `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`

Cloudflare's Git-connected build currently runs `npm run build` and deploys with Wrangler. The repository keeps `wrangler.jsonc` so the Worker configuration is reproducible rather than being silently generated during a build.

## Hard requirements

- No Lovable runtime or build dependency.
- No Netlify runtime dependency.
- No Colab requirement for ordinary users.
- Android-first; desktop browsers are supported where capabilities permit.
- Free/open-source model and browser runtimes are preferred.
- Paid AI APIs and user-supplied API keys are optional only when genuinely necessary and never required for the free core path.
- Provider/model machinery stays behind Buddy's execution layer.

## Deployment rules

- Cloudflare's native Git integration is the production deployment path.
- Do not maintain a second GitHub Actions Cloudflare deployment that requires `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` secrets.
- Do not reintroduce the old `little-reds-big-studio-611db058` Pages path.
- Do not add a vendor-specific application dependency merely to host the frontend.

## Verification standard

A green repository build is necessary but not sufficient. A deployment is considered live only after Cloudflare reports a successful Worker deployment and the deployed Android-facing URL responds. Product features still require separate end-to-end runtime verification.
