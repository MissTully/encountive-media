-- Security hardening (Supabase advisor findings, 2026-07-19):
-- SECURITY DEFINER functions were callable via the public REST API by roles
-- that never need them. Trigger/helper functions should not be exposed.

-- handle_new_user() runs as an auth trigger only — nobody calls it over the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- current_org_id() is used inside RLS policies (runs with the querying role,
-- so `authenticated` must keep EXECUTE) but anonymous visitors have no org.
revoke execute on function public.current_org_id() from anon;
