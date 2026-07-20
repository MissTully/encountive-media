-- Social publishing: connected social accounts and the record of every
-- publish attempt. An account row is one destination the org can post to —
-- a LinkedIn member profile, a Facebook Page, or an Instagram professional
-- account (IG rows are discovered through the Page they're linked to).
-- Tokens live here because this is an internal tool where every org member
-- is trusted to publish; RLS still scopes rows to the org.

-- An earlier, abandoned social-publishing attempt (branch deleted unmerged)
-- left empty social_connections/social_posts tables on the live database —
-- clear them so this schema is the one source of truth. No-ops on fresh DBs.
drop table if exists public.social_posts;
drop table if exists public.social_connections;

create table public.social_accounts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  -- 'linkedin' = member profile, 'facebook' = Facebook Page,
  -- 'instagram' = IG professional account linked to a Page.
  platform          text not null check (platform in ('linkedin', 'facebook', 'instagram')),
  -- The platform's id for the destination: LinkedIn member id (userinfo.sub),
  -- Facebook Page id, or IG user id.
  external_id       text not null,
  display_name      text not null,
  access_token      text not null,
  refresh_token     text,
  -- Null = the platform did not report an expiry (e.g. Page tokens derived
  -- from a long-lived user token).
  token_expires_at  timestamptz,
  -- Platform extras, e.g. { "page_id": "…" } on instagram rows.
  metadata          jsonb not null default '{}'::jsonb,
  connected_by      uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  -- Reconnecting refreshes the token instead of duplicating the destination.
  unique (org_id, platform, external_id)
);
create index social_accounts_org_id_idx on public.social_accounts (org_id);

create table public.social_posts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  video_id          uuid not null references public.videos (id) on delete cascade,
  -- Keep the history row if the account is disconnected.
  account_id        uuid references public.social_accounts (id) on delete set null,
  -- Denormalized so history stays readable after account deletion.
  platform          text not null check (platform in ('linkedin', 'facebook', 'instagram')),
  account_name      text not null,
  status            text not null default 'publishing' check (status in ('publishing', 'published', 'error')),
  caption           text,
  -- The platform's id/URL for the created post, when it reports one.
  external_post_id  text,
  post_url          text,
  error             text,
  created_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index social_posts_org_id_idx on public.social_posts (org_id);
create index social_posts_video_id_idx on public.social_posts (video_id);

alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;

create policy "org members manage social_accounts"
  on public.social_accounts for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "org members manage social_posts"
  on public.social_posts for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
