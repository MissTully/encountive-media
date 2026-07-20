-- Video editor: a `videos` row is one marketing video being assembled from
-- library images (clips) plus a music-library soundtrack. Clips play in
-- sequence, each holding for `duration_seconds`, with optional headline/body
-- text overlaid at the render layer (Creatomate) — never baked into images,
-- per the build-spec constraint. The finished MP4 lands in the `renders`
-- bucket at `{org_id}/videos/{video_id}.mp4` (videos.output_path).

create table public.videos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete set null,
  title           text not null default 'Untitled video',
  -- draft → rendering → ready, or error (render_error holds the reason).
  status          text not null default 'draft' check (status in ('draft', 'rendering', 'ready', 'error')),
  audio_asset_id  uuid references public.audio_assets (id) on delete set null,
  width           int not null default 1080,
  height          int not null default 1350,
  output_path     text,
  render_error    text,
  created_at      timestamptz not null default now()
);
create index videos_org_id_idx on public.videos (org_id);

create table public.video_clips (
  id                uuid primary key default gen_random_uuid(),
  video_id          uuid not null references public.videos (id) on delete cascade,
  position          int not null default 0,
  asset_id          uuid references public.assets (id) on delete set null,
  headline          text,
  body_copy         text,
  duration_seconds  numeric not null default 3 check (duration_seconds > 0),
  created_at        timestamptz not null default now()
);
create index video_clips_video_id_idx on public.video_clips (video_id);

alter table public.videos enable row level security;
alter table public.video_clips enable row level security;

-- videos: full access within the org.
create policy "org members manage videos"
  on public.videos for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- video_clips: scoped via the parent video's org.
create policy "org members manage video_clips"
  on public.video_clips for all to authenticated
  using (exists (
    select 1 from public.videos v
    where v.id = video_clips.video_id and v.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.videos v
    where v.id = video_clips.video_id and v.org_id = public.current_org_id()
  ));
