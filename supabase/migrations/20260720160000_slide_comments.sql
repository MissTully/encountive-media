-- Slide-level review comments: reviewers can flag an individual slide instead
-- of only approving/rejecting the whole carousel. Open (unresolved) comments
-- are fed into the next regeneration as revision notes and marked resolved
-- once a new carousel has been generated from them (src/lib/carousel.ts).

create table public.slide_comments (
  id          uuid primary key default gen_random_uuid(),
  slide_id    uuid not null references public.slides (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index slide_comments_slide_id_idx on public.slide_comments (slide_id);

alter table public.slide_comments enable row level security;

-- Scoped via slides -> carousels -> content_requests -> projects.
create policy "org members manage slide_comments"
  on public.slide_comments for all to authenticated
  using (exists (
    select 1 from public.slides s
    join public.carousels c on c.id = s.carousel_id
    join public.content_requests cr on cr.id = c.request_id
    join public.projects p on p.id = cr.project_id
    where s.id = slide_comments.slide_id and p.org_id = public.current_org_id()
  ))
  with check (exists (
    select 1 from public.slides s
    join public.carousels c on c.id = s.carousel_id
    join public.content_requests cr on cr.id = c.request_id
    join public.projects p on p.id = cr.project_id
    where s.id = slide_comments.slide_id and p.org_id = public.current_org_id()
  ));
