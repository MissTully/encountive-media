-- Row Level Security — scope every row to the signed-in user's organization.

-- Helper: the org_id of the current user. SECURITY DEFINER so it bypasses RLS
-- on profiles and cannot recurse inside policies.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;

-- Enable RLS on every application table.
alter table public.organizations    enable row level security;
alter table public.profiles          enable row level security;
alter table public.brand_kits        enable row level security;
alter table public.assets            enable row level security;
alter table public.projects          enable row level security;
alter table public.project_assets    enable row level security;
alter table public.content_requests  enable row level security;
alter table public.carousels         enable row level security;
alter table public.slides            enable row level security;

-- organizations: members can see their own org.
create policy "org members can view their organization"
  on public.organizations for select to authenticated
  using (id = public.current_org_id());

-- profiles: a user sees their own profile and others in their org; can update self.
create policy "view profiles in my org"
  on public.profiles for select to authenticated
  using (id = auth.uid() or org_id = public.current_org_id());
create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- brand_kits: full access within the org.
create policy "org members manage brand_kits"
  on public.brand_kits for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- assets: full access within the org.
create policy "org members manage assets"
  on public.assets for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- projects: full access within the org.
create policy "org members manage projects"
  on public.projects for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- project_assets: scoped via the parent project's org.
create policy "org members manage project_assets"
  on public.project_assets for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_assets.project_id and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_assets.project_id and p.org_id = public.current_org_id()
  ));

-- content_requests: scoped via the parent project's org.
create policy "org members manage content_requests"
  on public.content_requests for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = content_requests.project_id and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = content_requests.project_id and p.org_id = public.current_org_id()
  ));

-- carousels: scoped via content_requests -> projects.
create policy "org members manage carousels"
  on public.carousels for all to authenticated
  using (exists (
    select 1 from public.content_requests cr
    join public.projects p on p.id = cr.project_id
    where cr.id = carousels.request_id and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.content_requests cr
    join public.projects p on p.id = cr.project_id
    where cr.id = carousels.request_id and p.org_id = public.current_org_id()
  ));

-- slides: scoped via carousels -> content_requests -> projects.
create policy "org members manage slides"
  on public.slides for all to authenticated
  using (exists (
    select 1 from public.carousels c
    join public.content_requests cr on cr.id = c.request_id
    join public.projects p on p.id = cr.project_id
    where c.id = slides.carousel_id and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.carousels c
    join public.content_requests cr on cr.id = c.request_id
    join public.projects p on p.id = cr.project_id
    where c.id = slides.carousel_id and p.org_id = public.current_org_id()
  ));
