-- Social publishing: connected accounts + post history.
--
-- `social_connections` holds one row per connected posting destination —
-- a Facebook Page, an Instagram business/creator account, a LinkedIn member
-- (personal) or a LinkedIn organization (company page). Tokens are stored
-- org-scoped under RLS; only members of the org can read them, and all
-- posting happens server-side.
--
-- `social_posts` is the audit trail: every publish attempt for a video or a
-- carousel, its destination, status, and the resulting post URL or error.

create table public.social_connections (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  provider          text not null check (provider in ('facebook', 'instagram', 'linkedin')),
  -- personal = posts as the person; company = posts as a Page/organization.
  account_scope     text not null check (account_scope in ('personal', 'company')),
  display_name      text not null,
  external_id       text not null,
  access_token      text not null,
  token_expires_at  timestamptz,
  -- Provider-specific extras: e.g. Facebook page token, linked IG user id.
  metadata          jsonb not null default '{}',
  status            text not null default 'connected' check (status in ('connected', 'expired', 'error')),
  created_at        timestamptz not null default now(),
  unique (org_id, provider, account_scope, external_id)
);
create index social_connections_org_id_idx on public.social_connections (org_id);

create table public.social_posts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  connection_id  uuid references public.social_connections (id) on delete set null,
  video_id       uuid references public.videos (id) on delete set null,
  request_id     uuid references public.content_requests (id) on delete set null,
  caption        text,
  status         text not null default 'queued' check (status in ('queued', 'posting', 'posted', 'failed')),
  external_url   text,
  error          text,
  posted_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index social_posts_org_id_idx on public.social_posts (org_id);

alter table public.social_connections enable row level security;
alter table public.social_posts enable row level security;

create policy "org members manage social_connections"
  on public.social_connections for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members manage social_posts"
  on public.social_posts for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
