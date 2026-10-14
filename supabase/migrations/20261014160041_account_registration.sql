create schema if not exists gym_private;
revoke all on schema gym_private from public, anon, authenticated;
create table gym_private.auth_limits (
  fingerprint text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
create index auth_limits_window_idx on gym_private.auth_limits(window_start);
alter table gym_private.auth_limits enable row level security;
create or replace function public.gym_auth_allow_attempt(fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if fingerprint !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from gym_private.auth_limits where window_start < now() - interval '1 day';
  insert into gym_private.auth_limits as l values (fingerprint, now(), 1)
  on conflict (fingerprint) do update set
    attempts = case when l.window_start < now() - interval '1 hour' then 1 else l.attempts + 1 end,
    window_start = case when l.window_start < now() - interval '1 hour' then now() else l.window_start end
  returning attempts into n;
  return n <= 30;
end;
$$;
revoke all on function public.gym_auth_allow_attempt(text) from public, anon, authenticated;
grant execute on function public.gym_auth_allow_attempt(text) to service_role;
create or replace function public.gym_pending_account(address text)
returns uuid language sql security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(address)
  and email_confirmed_at is null and role = 'authenticated' limit 1;
$$;
revoke all on function public.gym_pending_account(text) from public, anon, authenticated;
grant execute on function public.gym_pending_account(text) to service_role;
