alter table public.profiles
  alter column trial_started_at drop default;

create or replace function public.start_trial_on_successful_login()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
     set trial_started_at = coalesce(trial_started_at, now()),
         updated_at = now()
   where id = auth.uid()
   returning trial_started_at into started_at;

  if started_at is null then
    raise exception 'profile_not_found';
  end if;

  return started_at;
end;
$$;

grant execute on function public.start_trial_on_successful_login() to authenticated;

create or replace function public.get_entitlement()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'trial_started_at', p.trial_started_at,
    'trial_ends_at', case when p.trial_started_at is null then null else p.trial_started_at + interval '7 days' end,
    'trial_active', p.trial_started_at is not null and now() < p.trial_started_at + interval '7 days',
    'membership_active', exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.status in ('active', 'paused', 'cancelled')
        and (m.current_period_end is null or m.current_period_end > now())
    ),
    'unlimited',
      (p.trial_started_at is not null and now() < p.trial_started_at + interval '7 days')
      or exists (
        select 1 from public.memberships m
        where m.user_id = auth.uid()
          and m.status in ('active', 'paused', 'cancelled')
          and (m.current_period_end is null or m.current_period_end > now())
      ),
    'buddy_unleashed', exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.status in ('active', 'paused', 'cancelled')
        and (m.current_period_end is null or m.current_period_end > now())
    )
  )
  from public.profiles p
  where p.id = auth.uid();
$$;
