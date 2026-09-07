create or replace function public.reconcile_bmac_membership_for_current_user()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  membership_data jsonb;
  membership_event_type text;
  provider_member_id text;
  period_end timestamptz;
  membership_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select lower(trim(email)) into current_email from auth.users where id = auth.uid();
  if current_email is null or current_email = '' then return false; end if;

  select e.payload -> 'data', lower(coalesce(e.payload ->> 'type', ''))
    into membership_data, membership_event_type
  from public.bmac_webhook_events e
  where lower(trim(coalesce(e.payload -> 'data' ->> 'supporter_email', ''))) = current_email
    and lower(coalesce(e.payload ->> 'type', '')) in ('membership.started','membership.updated','membership.cancelled','membership.paused')
    and coalesce(e.payload -> 'data' ->> 'duration_type', '') = 'month'
    and upper(coalesce(e.payload -> 'data' ->> 'currency', '')) = 'USD'
    and coalesce((e.payload -> 'data' ->> 'amount')::numeric, 0) = 10
  order by e.received_at desc
  limit 1;

  if membership_data is null then return false; end if;
  provider_member_id := trim(coalesce(membership_data ->> 'psp_id', membership_data ->> 'id', ''));
  if provider_member_id = '' then return false; end if;

  period_end := case
    when (membership_data ->> 'current_period_end') ~ '^\\d+(\\.\\d+)?$'
      then to_timestamp((membership_data ->> 'current_period_end')::double precision)
    else (membership_data ->> 'current_period_end')::timestamptz
  end;
  if period_end is null then return false; end if;

  membership_status := case membership_event_type
    when 'membership.cancelled' then 'cancelled'
    when 'membership.paused' then 'paused'
    else 'active'
  end;

  insert into public.memberships (user_id, provider, provider_member_id, status, tier, current_period_end, updated_at)
  values (auth.uid(), 'buymeacoffee', provider_member_id, membership_status, 'unlimited', period_end, now())
  on conflict (provider, provider_member_id) do update
  set user_id = excluded.user_id,
      status = excluded.status,
      tier = excluded.tier,
      current_period_end = excluded.current_period_end,
      updated_at = now();

  if membership_event_type in ('membership.started','membership.updated') then
    insert into public.email_events (user_id, event_type, idempotency_key, payload)
    values (
      auth.uid(),
      'membership_unlimited',
      format('membership-unlimited:%s', provider_member_id),
      jsonb_build_object('display_name', (select display_name from public.profiles where id = auth.uid()))
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.bmac_webhook_events
     set processed_at = now()
   where payload ->> 'event_id' = (
     select e2.payload ->> 'event_id'
     from public.bmac_webhook_events e2
     where lower(trim(coalesce(e2.payload -> 'data' ->> 'supporter_email', ''))) = current_email
     order by e2.received_at desc
     limit 1
   );
  return true;
end;
$$;

grant execute on function public.reconcile_bmac_membership_for_current_user() to authenticated;

create or replace function public.start_trial_on_successful_login()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
  display_name_value text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  update public.profiles
     set trial_started_at = coalesce(trial_started_at, now()), updated_at = now()
   where id = auth.uid()
   returning trial_started_at, display_name into started_at, display_name_value;

  if started_at is null then raise exception 'profile_not_found'; end if;

  insert into public.email_events (user_id, event_type, idempotency_key, payload)
  values (
    auth.uid(),
    'welcome',
    format('welcome:%s', auth.uid()),
    jsonb_build_object('display_name', display_name_value)
  ) on conflict (idempotency_key) do nothing;

  perform public.reconcile_bmac_membership_for_current_user();
  return started_at;
end;
$$;

grant execute on function public.start_trial_on_successful_login() to authenticated;
