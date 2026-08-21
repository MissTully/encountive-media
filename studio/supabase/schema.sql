-- Encountive Studio — paste into Supabase SQL editor (once per project).
-- Then set on deploy:
--   DATABASE_URL                  = Transaction pooler URI (port 6543, ssl)
--   SUPABASE_URL                  = https://<ref>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY     = service_role (server only)
--   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
--   META_APP_ID / META_APP_SECRET

create table if not exists social_accounts (
  id text primary key,
  user_id text not null,
  platform text not null,
  account_name text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  meta text,
  created_at timestamptz not null default now()
);
create unique index if not exists social_accounts_user_platform_idx
  on social_accounts (user_id, platform);

create table if not exists publish_jobs (
  id text primary key,
  user_id text not null,
  campaign_id text not null,
  campaign_title text not null default '',
  platform text not null,
  kind text not null,
  caption text,
  status text not null,
  error text,
  posted_url text,
  created_at timestamptz not null default now()
);
create index if not exists publish_jobs_user_id_idx on publish_jobs (user_id);

create table if not exists media_objects (
  id text primary key,
  user_id text not null,
  path text not null,
  public_url text not null,
  content_type text,
  created_at timestamptz not null default now()
);
create index if not exists media_objects_user_id_idx on media_objects (user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "public read media" on storage.objects;
create policy "public read media"
  on storage.objects for select
  using (bucket_id = 'media');
