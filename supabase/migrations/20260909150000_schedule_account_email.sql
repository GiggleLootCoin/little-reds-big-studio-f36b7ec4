create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.email_cron_config (
  id boolean primary key default true check (id),
  secret text not null,
  created_at timestamptz not null default now()
);

alter table public.email_cron_config enable row level security;
revoke all on table public.email_cron_config from anon, authenticated;
grant select on table public.email_cron_config to service_role;

insert into public.email_cron_config (id, secret)
values (true, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create or replace function public.get_email_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select secret from public.email_cron_config where id = true;
$$;

revoke execute on function public.get_email_cron_secret() from public, anon, authenticated;
grant execute on function public.get_email_cron_secret() to service_role;

select cron.schedule(
  'account-email-daily',
  '15 9 * * *',
  $$
    select net.http_post(
      url := 'https://awkjmzrjfdjvlmdbtnzy.supabase.co/functions/v1/account-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-cron-secret', public.get_email_cron_secret()
      ),
      body := jsonb_build_object('source', 'cron'),
      timeout_milliseconds := 10000
    ) as request_id;
  $$
);
