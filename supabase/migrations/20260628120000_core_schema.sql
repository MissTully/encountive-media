-- Encountive Content Studio — core schema (spec section 4)
-- Multi-tenant: every table carries org_id directly or via a parent.

-- pgvector for semantic search over asset embeddings.
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — links Supabase Auth users to an organization
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete restrict,
  role        text not null default 'editor',
  full_name   text,
  created_at  timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles (org_id);

-- ---------------------------------------------------------------------------
-- brand_kits
-- ---------------------------------------------------------------------------
create table public.brand_kits (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  name              text not null,
  colors            jsonb not null default '{}'::jsonb,
  fonts             jsonb not null default '{}'::jsonb,
  logo_url          text,
  voice_guidelines  text,
  created_at        timestamptz not null default now()
);
create index brand_kits_org_id_idx on public.brand_kits (org_id);

-- ---------------------------------------------------------------------------
-- assets — the image library (uploaded + generated images live together)
-- ---------------------------------------------------------------------------
create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  storage_path  text not null,
  title         text,
  description   text,
  tags          text[] not null default '{}',
  source        text not null default 'uploaded' check (source in ('uploaded', 'generated')),
  status        text not null default 'uploaded' check (status in ('uploaded', 'analyzing', 'ready')),
  mime_type     text,
  width         int,
  height        int,
  embedding     vector(768),
  created_at    timestamptz not null default now()
);
create index assets_org_id_idx on public.assets (org_id);
create index assets_status_idx on public.assets (status);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);
create index projects_org_id_idx on public.projects (org_id);

-- ---------------------------------------------------------------------------
-- project_assets — join table; this IS the project board
-- ---------------------------------------------------------------------------
create table public.project_assets (
  project_id  uuid not null references public.projects (id) on delete cascade,
  asset_id    uuid not null references public.assets (id) on delete cascade,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (project_id, asset_id)
);
create index project_assets_asset_id_idx on public.project_assets (asset_id);

-- ---------------------------------------------------------------------------
-- content_requests — one carousel job
-- ---------------------------------------------------------------------------
create table public.content_requests (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  brand_kit_id     uuid references public.brand_kits (id) on delete set null,
  topic            text,
  brief            text,
  target_platform  text,
  status           text not null default 'queued'
                     check (status in ('queued', 'generating', 'in_review', 'approved')),
  created_at       timestamptz not null default now()
);
create index content_requests_project_id_idx on public.content_requests (project_id);
create index content_requests_status_idx on public.content_requests (status);

-- ---------------------------------------------------------------------------
-- carousels
-- ---------------------------------------------------------------------------
create table public.carousels (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.content_requests (id) on delete cascade,
  status       text not null default 'pending',
  slide_count  int not null default 0,
  output_path  text,
  created_at   timestamptz not null default now()
);
create index carousels_request_id_idx on public.carousels (request_id);

-- ---------------------------------------------------------------------------
-- slides
-- ---------------------------------------------------------------------------
create table public.slides (
  id           uuid primary key default gen_random_uuid(),
  carousel_id  uuid not null references public.carousels (id) on delete cascade,
  position     int not null default 0,
  headline     text,
  body_copy    text,
  asset_id     uuid references public.assets (id) on delete set null,
  render_path  text,
  created_at   timestamptz not null default now()
);
create index slides_carousel_id_idx on public.slides (carousel_id);
