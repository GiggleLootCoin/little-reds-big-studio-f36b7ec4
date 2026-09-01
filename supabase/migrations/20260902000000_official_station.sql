alter table public.profiles
  add column if not exists handle text,
  add column if not exists bio text not null default '',
  add column if not exists banner_url text,
  add column if not exists website_url text,
  add column if not exists station_name text,
  add column if not exists is_public boolean not null default true;

update public.profiles
set handle = lower(regexp_replace(coalesce(handle, display_name, 'creator'), '[^a-zA-Z0-9_]+', '-', 'g'))
where handle is null or handle = '';

alter table public.profiles
  alter column handle set not null;

create unique index if not exists profiles_handle_lower_unique
  on public.profiles (lower(handle));

create table if not exists public.station_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('music','video','artwork','beat','other')),
  title text not null,
  description text not null default '',
  asset_url text not null,
  thumbnail_url text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  published_at timestamptz,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists station_items_user_published_idx
  on public.station_items (user_id, published_at desc, sort_order asc);

create index if not exists station_items_public_idx
  on public.station_items (visibility, published_at desc);

alter table public.station_items enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "public profiles are readable" on public.profiles;
create policy "public profiles are readable"
  on public.profiles for select
  using (is_public = true or auth.uid() = id);

drop policy if exists "owners update their profile" on public.profiles;
create policy "owners update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "public station items are readable" on public.station_items;
create policy "public station items are readable"
  on public.station_items for select
  using (
    visibility = 'public'
    or auth.uid() = user_id
  );

drop policy if exists "owners create station items" on public.station_items;
create policy "owners create station items"
  on public.station_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "owners update station items" on public.station_items;
create policy "owners update station items"
  on public.station_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owners delete station items" on public.station_items;
create policy "owners delete station items"
  on public.station_items for delete
  using (auth.uid() = user_id);
