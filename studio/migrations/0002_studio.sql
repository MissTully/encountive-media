-- Social connections and publish jobs (maps the original Supabase user_tokens + jobs)
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
create index if not exists social_accounts_user_id_idx on social_accounts (user_id);

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
