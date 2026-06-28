-- Auto-provision a profile for every new auth user, linked to the single
-- v1 organization (Encountive). Runs as the table owner (SECURITY DEFINER)
-- so it can write to profiles regardless of RLS.
--
-- NOTE (security): in v1 this admits ANY successful Google sign-in into the
-- Encountive org. For an internal tool, restrict who can sign in via the
-- Supabase Auth dashboard (allowed email domains / disable new signups), or
-- add an email allowlist check below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select id into v_org_id
  from public.organizations
  where name = 'Encountive'
  limit 1;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    v_org_id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    'editor'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
