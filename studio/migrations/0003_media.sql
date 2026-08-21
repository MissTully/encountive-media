-- Public media objects uploaded to Supabase Storage (or recorded as URLs).
create table if not exists media_objects (
  id text primary key,
  user_id text not null,
  path text not null,
  public_url text not null,
  content_type text,
  created_at timestamptz not null default now()
);
create index if not exists media_objects_user_id_idx on media_objects (user_id);
