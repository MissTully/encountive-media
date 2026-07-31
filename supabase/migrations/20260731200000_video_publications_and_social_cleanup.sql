-- Extend the publish log to rendered videos, and retire the parallel social
-- tables from the earlier video-editor branch (`social_connections` +
-- `social_posts`), which were superseded by `social_accounts` +
-- `publications` before ever being used (their OAuth flows were never
-- configured, so the tables hold no data).
--
-- A publication now references exactly one piece of content: an approved
-- carousel (request_id) or a rendered video (video_id).

alter table public.publications
  alter column request_id drop not null;
alter table public.publications
  add column video_id uuid references public.videos (id) on delete cascade;
create index if not exists publications_video_id_idx
  on public.publications (video_id);

alter table public.publications
  add constraint publications_one_content_ref check (
    (request_id is not null)::int + (video_id is not null)::int = 1
  );

drop table if exists public.social_posts;
drop table if exists public.social_connections;
