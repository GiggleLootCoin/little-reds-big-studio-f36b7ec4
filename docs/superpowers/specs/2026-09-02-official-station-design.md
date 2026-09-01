# Official Station + Creator Profiles Design

## Goal
Give every signed-in creator a persistent public profile and an Official Station (channel) similar in concept to BandLab, while preserving the Studio's Buddy-first and Android-first UX.

## Scope
- Account profile identity: handle, display name, bio, avatar, banner, external link, public/private flag.
- One Official Station per account, addressed by a stable handle.
- Station publishing records for music, video, artwork, beats, playlists and other Studio artifacts.
- Private drafts remain private; public Station content is readable without an account.
- Buddy can publish a completed artifact to the signed-in user's Station after the user explicitly requests publishing.
- Account entitlement remains server-authoritative: first successful login starts a seven-day unlimited trial; after that the paid tier is $10/month through the existing Buy Me a Coffee membership.

## Data model
`profiles` gains `handle`, `bio`, `banner_url`, `website_url`, `station_name`, and `is_public`.
`station_items` stores `id`, `user_id`, `kind`, `title`, `description`, `asset_url`, `thumbnail_url`, `visibility`, `published_at`, `sort_order`, and `metadata`.
Handles are unique and normalized to lowercase. RLS allows a user to manage only their own profile/items and allows anonymous reads only for public profiles and public station items.

## UX
The Community tab gets an Official Station panel and an edit profile panel. A public route `/station/:handle` renders the creator's station. The owner sees publish/manage controls when signed in. The station is designed as a creator home, not a generic social feed.

## Publishing contract
A publish operation requires a real artifact URL; the client never publishes a placeholder or unverified job ID. `kind` is capability-facing (`music`, `video`, `artwork`, `beat`, `other`).

## Monetization
The UI clearly shows Free Trial, Trial Expired, and Paid states. The trial countdown is derived from server data. Buy Me a Coffee membership events are verified by a signed webhook; the app never grants paid access from browser state alone.

## Constraints
- Android/mobile-first.
- Free/open AI execution remains separate from paid membership.
- Do not modify the Pocket TTS environment.
- Do not expose provider machinery to creators.
- Do not claim production verification without fresh CI/runtime evidence.
