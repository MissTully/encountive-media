-- Reuse-aware image selection for carousel generation (n8n Workflow C, spec step 4).
-- For a slide's image-need embedding, pick the best background in priority order:
--   (a) the project's board, (b) the wider org library — both via cosine similarity.
-- The org is derived from the project, so the caller only passes the project id.
-- Always returns EXACTLY ONE row: the chosen asset, or (null, null, false) when
-- nothing clears the threshold (the caller then generates a new image). Returning
-- a single row keeps the n8n RPC step to one item per slide.
create or replace function public.pick_slide_asset(
  query_embedding  vector(768),
  p_project_id     uuid,
  match_threshold  float
)
returns table (asset_id uuid, similarity float, from_board boolean)
language sql
stable
set search_path = public
as $$
  with org as (
    select org_id from public.projects where id = p_project_id
  ),
  board as (
    select a.id, 1 - (a.embedding <=> query_embedding) as sim
    from public.project_assets pa
    join public.assets a on a.id = pa.asset_id
    where pa.project_id = p_project_id
      and a.status = 'ready' and a.embedding is not null
    order by a.embedding <=> query_embedding limit 1
  ),
  lib as (
    select a.id, 1 - (a.embedding <=> query_embedding) as sim
    from public.assets a
    where a.org_id = (select org_id from org)
      and a.status = 'ready' and a.embedding is not null
    order by a.embedding <=> query_embedding limit 1
  ),
  choice as (
    select b.id, b.sim, true as fb from board b where b.sim > match_threshold
    union all
    select l.id, l.sim, false from lib l
    where l.sim > match_threshold
      and not exists (select 1 from board b where b.sim > match_threshold)
  )
  select id, sim, fb from choice
  union all
  select null::uuid, null::float, false where not exists (select 1 from choice)
  limit 1;
$$;

grant execute on function public.pick_slide_asset(vector, uuid, float) to authenticated, service_role;
