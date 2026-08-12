# Durable Decisions

## Repository authority

`GiggleLootCoin/little-reds-big-studio-f36b7ec4` is the authoritative Studio repository. The older `little-reds-big-studio-611db058` repository must not become authoritative again.

## Production authority

Cloudflare Workers is the current production hosting authority. Do not silently switch back to stale Lovable-hosted production metadata.

## Provider abstraction

Provider/model names stay backstage. Buddy selects routes and fallbacks. The UI represents capabilities, not vendor machinery.

## Free/open-first

No mandatory paid AI API or provider account. Prefer public/open/free execution and browser-local options where they genuinely work.

## Honest generation

A request is successful only after compatible request schema, execution, returned artifact and artifact validation. A UI control alone is not a working feature.

## Persistent memory

Project engineering memory belongs in `.studio-memory/`. Buddy's user memory belongs in account/project storage and is architecturally separate.

## Android

Android/mobile use is a hard requirement. Verification must include actual mobile/runtime paths, not only desktop build success.

## Membership

Buy Me a Coffee membership is the paid target. Entitlements are server-authoritative; local/browser state cannot grant paid access. The webhook secret must be live-verified before membership is called fully production-verified.
