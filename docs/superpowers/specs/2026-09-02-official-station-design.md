# Official Station + Creator Profiles Design

## Status

Implemented and verified on `feature/official-station`.

## Implemented

- Persistent creator profiles with unique normalized handles, bio, banner, website, Station name, and public/private state.
- One Official Station per creator.
- Station items for music, video, artwork, beats and other artifacts.
- Owner-only publishing/deletion through Supabase RLS.
- Public `/station/:handle` creator Station page.
- Mobile-first Station controls in the Artists tab.
- Clear `FREE — 7 days unlimited`, `$10/month`, and Buy Me a Coffee messaging.
- Supabase schema, indexes, policies and profile-default trigger applied to the connected project.

## Verification

The current head passed TypeScript, formatting, ESLint, Buddy regression tests, production build, browser voice bundle verification, and dependency audit.

## Constraints

Android-first; free/open AI execution remains separate from paid membership; Pocket TTS untouched; provider machinery remains backstage.
