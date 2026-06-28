-- Semantic search over assets (spec section 4). Returns ready assets for an
-- org whose embedding is closest to query_embedding and above the threshold,
-- ordered by cosine similarity.

-- HNSW index for fast cosine-distance search.
create index assets_embedding_idx
  on public.assets using hnsw (embedding vector_cosine_ops);

create or replace function public.match_assets(
  query_embedding  vector(768),
  p_org_id         uuid,
  match_threshold  float,
  match_count      int
)
returns table (
  id            uuid,
  storage_path  text,
  title         text,
  description   text,
  tags          text[],
  similarity    float
)
language sql
stable
set search_path = public
as $$
  select
    a.id,
    a.storage_path,
    a.title,
    a.description,
    a.tags,
    1 - (a.embedding <=> query_embedding) as similarity
  from public.assets a
  where a.org_id = p_org_id
    and a.status = 'ready'
    and a.embedding is not null
    and 1 - (a.embedding <=> query_embedding) > match_threshold
  order by a.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_assets(vector, uuid, float, int) to authenticated, service_role;
