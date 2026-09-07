alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists birthday_emails_enabled boolean not null default false,
  add column if not exists marketing_email_opt_in boolean not null default false;

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('welcome','membership_unlimited','milestone','birthday')),
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_events_pending_idx
  on public.email_events (status, created_at)
  where status = 'pending';

alter table public.email_events enable row level security;

create or replace function public.enqueue_email_event(
  p_event_type text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.email_events (user_id, event_type, idempotency_key, payload)
  values (auth.uid(), p_event_type, p_idempotency_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (idempotency_key) do update
    set updated_at = now()
  returning id into event_id;

  return event_id;
end;
$$;

grant execute on function public.enqueue_email_event(text, text, jsonb) to authenticated;

create or replace function public.queue_due_lifecycle_emails()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  milestone_months integer[] := array[3,6,12];
  months integer;
  milestone_date date;
  local_today date;
  birthday_this_year date;
  birthday_key text;
  inserted_count integer := 0;
begin
  for p in
    select pr.id, pr.display_name, pr.date_of_birth, pr.timezone, pr.birthday_emails_enabled, pr.trial_started_at
    from public.profiles pr
    where pr.trial_started_at is not null
  loop
    local_today := (now() at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date;

    if p.date_of_birth is not null and p.birthday_emails_enabled then
      birthday_this_year := make_date(
        extract(year from local_today)::integer,
        extract(month from p.date_of_birth)::integer,
        case
          when extract(month from p.date_of_birth)::integer = 2
            and extract(day from p.date_of_birth)::integer = 29
            and not (
              mod(extract(year from local_today)::integer, 4) = 0
              and (mod(extract(year from local_today)::integer, 100) <> 0 or mod(extract(year from local_today)::integer, 400) = 0)
            ) then 28
          else extract(day from p.date_of_birth)::integer
        end
      );

      if local_today = birthday_this_year then
        birthday_key := format('birthday:%s:%s', p.id, extract(year from local_today)::integer);
        insert into public.email_events (user_id, event_type, idempotency_key, payload)
        values (p.id, 'birthday', birthday_key, jsonb_build_object('display_name', p.display_name))
        on conflict (idempotency_key) do nothing;
        if found then inserted_count := inserted_count + 1; end if;
      end if;
    end if;

    foreach months in array milestone_months
    loop
      milestone_date := (p.trial_started_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date + make_interval(months => months);
      if local_today >= milestone_date then
        insert into public.email_events (user_id, event_type, idempotency_key, payload)
        values (
          p.id,
          'milestone',
          format('milestone:%s:%s', p.id, months),
          jsonb_build_object('display_name', p.display_name, 'months', months)
        )
        on conflict (idempotency_key) do nothing;
        if found then inserted_count := inserted_count + 1; end if;
      end if;
    end loop;

    months := greatest(24, floor(extract(year from age(local_today::timestamp, (p.trial_started_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date)) * 12)::integer);
    if months >= 24 and months % 12 = 0 then
      milestone_date := (p.trial_started_at at time zone coalesce(nullif(p.timezone, ''), 'UTC'))::date + make_interval(months => months);
      if local_today >= milestone_date then
        insert into public.email_events (user_id, event_type, idempotency_key, payload)
        values (
          p.id,
          'milestone',
          format('milestone:%s:%s', p.id, months),
          jsonb_build_object('display_name', p.display_name, 'months', months)
        )
        on conflict (idempotency_key) do nothing;
        if found then inserted_count := inserted_count + 1; end if;
      end if;
    end if;
  end loop;

  return inserted_count;
end;
$$;

grant execute on function public.queue_due_lifecycle_emails() to service_role;
