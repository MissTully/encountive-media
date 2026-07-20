-- Video clip asset library + safe asset deletion.
--
-- `video_assets` mirrors the image/music libraries for uploaded video files
-- (b-roll, screen recordings, product clips), stored in a private `clips`
-- bucket. Video-editor timelines can now reference either a still image
-- (asset_id) or a video clip (video_asset_id).
--
-- Also fixes delete behavior for library images: the original FKs used the
-- default NO ACTION, so deleting an asset that was on a project board failed
-- outright. Board membership now cascades away and slides/clips keep their
-- copy but lose the background reference (set null), matching video_clips.

create table public.video_assets (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  storage_path      text not null,
  title             text,
  tags              text[] not null default '{}',
  source            text not null default 'uploaded' check (source in ('uploaded', 'generated')),
  status            text not null default 'ready' check (status in ('uploaded', 'analyzing', 'ready')),
  mime_type         text,
  duration_seconds  numeric,
  width             int,
  height            int,
  created_at        timestamptz not null default now()
);
create index video_assets_org_id_idx on public.video_assets (org_id);
create index video_assets_status_idx on public.video_assets (status);

alter table public.video_assets enable row level security;

create policy "org members manage video_assets"
  on public.video_assets for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- A timeline clip is either an image or a video clip.
alter table public.video_clips
  add column video_asset_id uuid references public.video_assets (id) on delete set null;

-- Safe image deletion: cascade board rows, null slide/clip references.
alter table public.project_assets
  drop constraint project_assets_asset_id_fkey,
  add constraint project_assets_asset_id_fkey
    foreign key (asset_id) references public.assets (id) on delete cascade;
alter table public.slides
  drop constraint slides_asset_id_fkey,
  add constraint slides_asset_id_fkey
    foreign key (asset_id) references public.assets (id) on delete set null;

-- `clips` storage bucket — private, org-prefixed paths like the others.
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;

create policy "org members read their clips objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members upload to their clips folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members update their clips objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  )
  with check (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

create policy "org members delete their clips objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'clips'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
