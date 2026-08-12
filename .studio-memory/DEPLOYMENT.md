# Deployment Record

## Production
- Hosting: Cloudflare Workers
- Current documented URL: `https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev`
- Source of truth: `main` in `GiggleLootCoin/little-reds-big-studio-f36b7ec4`

## CI gates
Production validation has been hardened around dependency installation, TypeScript, Prettier formatting, ESLint and production build. Recent work also made Cloudflare deployment/runtime configuration explicit and corrected production metadata.

## Deployment history
- `77892e94046f284810685a4c7b32691f3832a27e4`: CI formatting before production validation.
- `996bd7bed459e901d808279ffd2e0c73ce295b2b`: production metadata pointed at Cloudflare Worker.
- `fee53ac0d379b802426597882deec490a2128fe0`: corrected live production URL/runtime routes.
- `d8f7edaabc4d3f4885f73bbdef3805406f40b99e`: production-safe public logo asset.
- `0b89d9928c2e7aec2596f890d1a21125570e6b12`: removed obsolete hosted logo metadata.

## Required final production verification
1. Confirm the deployed commit/version matches the intended `main` state.
2. Confirm live app loads correctly on Android.
3. Test authentication/password recovery.
4. Test Buddy microphone/hands-free loop.
5. Test at least one real generation route and validate its artifact.
6. Exercise the signed membership webhook with the real production secret before calling membership fully verified.
7. Record evidence here and update `CURRENT-STATE.md`.
