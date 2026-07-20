-- Music asset library: `audio_assets` mirrors the image `assets` table
-- (duration/artist instead of pixel dimensions), stored in a private `audio`
-- bucket with the same "{org_id}/file.ext" path convention. Carousels can
-- reference one track as the soundtrack for the final video preview.

-- ---------------------------------------------------------------------------
-- audio_assets — the music library
-- ---------------------------------------------------------------------------
create table public.audio_assets (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  storage_path      text not null,
  title             text,
  artist            text,
  tags              text[] not null default '{}',
  source            text not null default 'uploaded' check (source in ('uploaded', 'generated')),
  status            text not null default 'ready' check (status in ('uploaded', 'analyzing', 'ready')),
  mime_type         text,
  duration_seconds  numeric,
  created_at        timestamptz not null default now()
);
create index audio_assets_org_id_idx on public.audio_assets (org_id);
create index audio_assets_status_idx on public.audio_assets (status);

alter table public.audio_assets enable row level security;

-- audio_assets: full access within the org (same policy shape as assets).
create policy "org members manage audio_assets"
  on public.audio_assets for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- carousels.audio_asset_id — the soundtrack behind the final video preview
-- ---------------------------------------------------------------------------
alter table public.carousels
  add column audio_asset_id uuid references public.audio_assets (id) on delete set null;

-- ---------------------------------------------------------------------------
-- `audio` storage bucket — private, org-prefixed paths like the other buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "org members read their audio objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members upload to their audio folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members update their audio objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  )
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members delete their audio objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
