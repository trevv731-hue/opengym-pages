create or replace function public.gym_auth_allow_attempt(fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if fingerprint !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from gym_private.auth_limits where window_start < now() - interval '1 day';
  insert into gym_private.auth_limits as l values (fingerprint, now(), 1)
  on conflict on constraint auth_limits_pkey do update set
    attempts = case when l.window_start < now() - interval '1 hour' then 1 else l.attempts + 1 end,
    window_start = case when l.window_start < now() - interval '1 hour' then now() else l.window_start end
  returning l.attempts into n;
  return n <= 30;
end;
$$;
revoke all on function public.gym_auth_allow_attempt(text) from public, anon, authenticated;
grant execute on function public.gym_auth_allow_attempt(text) to service_role;
