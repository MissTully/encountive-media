-- Direct-to-platform publishing: the missing last mile after approval.
-- `social_accounts` stores the org's connected destinations (Instagram
-- business account, Facebook Page, LinkedIn organization); `publications`
-- records every attempt to post an approved carousel to one of those
-- destinations, so the review screen can show where each carousel went.
--
-- Reconciliation note: the live project already carries a `social_accounts`
-- table (and a video-oriented `social_posts` table) from earlier untracked
-- work, so this migration is written to converge rather than collide —
-- `if not exists` on the table and a guarded policy. `publications` is new.
--
-- Human approval stays mandatory: publishing is only offered once a request
-- reaches `approved`, and each publish is an explicit button press.
--
-- Tokens are org-visible through RLS, which is acceptable for this internal
-- single-org tool; move them to a vault/secret store before offering the
-- external multi-tenant product.

create table if not exists public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  platform         text not null check (platform in ('linkedin', 'facebook', 'instagram')),
  -- Platform-side identity the APIs post as: IG business-user id,
  -- Facebook Page id, or LinkedIn author URN (urn:li:organization:...).
  external_id      text not null,
  display_name     text not null,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  connected_by     uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (org_id, platform, external_id)
);

create table if not exists public.publications (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.content_requests (id) on delete cascade,
  social_account_id  uuid not null references public.social_accounts (id) on delete cascade,
  caption            text not null default '',
  status             text not null default 'publishing'
                       check (status in ('publishing', 'published', 'failed')),
  post_ref           text,        -- platform post/media id
  post_url           text,        -- permalink when the platform provides one
  error              text,
  published_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists publications_request_id_idx
  on public.publications (request_id);
create index if not exists publications_social_account_id_idx
  on public.publications (social_account_id);

alter table public.social_accounts enable row level security;
alter table public.publications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'social_accounts'
      and policyname = 'org members manage social_accounts'
  ) then
    create policy "org members manage social_accounts"
      on public.social_accounts for all to authenticated
      using (org_id = public.current_org_id())
      with check (org_id = public.current_org_id());
  end if;
end $$;

-- Scoped via the destination account's org.
create policy "org members manage publications"
  on public.publications for all to authenticated
  using (exists (
    select 1 from public.social_accounts sa
    where sa.id = publications.social_account_id
      and sa.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.social_accounts sa
    where sa.id = publications.social_account_id
      and sa.org_id = public.current_org_id()
  ));
