-- Private account documents and revision-checked writes. Browser clients use
-- only the publishable key; a service-role key must never be put in the frontend.
create table if not exists public.gym_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.gym_profiles enable row level security;
drop policy if exists gym_read_own_profile on public.gym_profiles;
create policy gym_read_own_profile on public.gym_profiles for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.gym_profiles from anon, authenticated;
grant select on public.gym_profiles to authenticated;

create or replace function public.save_gym_profile(expected_revision bigint, document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_row public.gym_profiles;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(document) is distinct from 'object'
     or jsonb_typeof(document->'workouts') is distinct from 'array'
     or jsonb_typeof(document->'routines') is distinct from 'array'
     or jsonb_typeof(document->'bodyweight') is distinct from 'array'
     or jsonb_typeof(document->'customEx') is distinct from 'array'
     or octet_length(document::text) > 5242880
     or expected_revision < 0 or expected_revision is null
  then raise exception 'Invalid profile document' using errcode = '22023'; end if;
  -- An insert racing another first save must not overwrite that save.
  if expected_revision = 0 then
    insert into public.gym_profiles(user_id, revision, state)
      values (uid, 1, document - 'active') on conflict (user_id) do nothing;
    if found then
      return jsonb_build_object('conflict', false, 'revision', 1, 'state', document - 'active');
    end if;
  end if;
  select * into current_row from public.gym_profiles where user_id = uid for update;
  if not found then raise exception 'Profile missing; retry from revision zero'; end if;
  if current_row.revision <> expected_revision then
    return jsonb_build_object('conflict', true, 'revision', current_row.revision, 'state', current_row.state);
  end if;
  update public.gym_profiles set revision = revision + 1, state = document - 'active', updated_at = now()
    where user_id = uid returning * into current_row;
  return jsonb_build_object('conflict', false, 'revision', current_row.revision, 'state', current_row.state);
end;
$$;
revoke all on function public.save_gym_profile(bigint, jsonb) from public, anon;
grant execute on function public.save_gym_profile(bigint, jsonb) to authenticated;

-- Personal media are private, keyed by account and content hash. Built-in
-- exercise illustrations remain static web assets and consume no storage here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-media', 'gym-media', false, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;
drop policy if exists gym_media_read_own on storage.objects;
create policy gym_media_read_own on storage.objects for select to authenticated
using (bucket_id = 'gym-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists gym_media_insert_own on storage.objects;
create policy gym_media_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'gym-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
