drop index if exists public.memberships_provider_member_unique;
create index if not exists email_events_user_created_idx on public.email_events (user_id, created_at desc);
