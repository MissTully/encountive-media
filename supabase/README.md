# Supabase

Database schema and migrations for Encountive Content Studio.

- **Project:** Encountive Media (`lbbotfsgkqddzzshmwvw`, region `us-east-2`)
- **Postgres:** 17 · **pgvector** enabled for semantic search

## Migrations

Applied in order (already live on the project above):

| File | What it does |
| --- | --- |
| `20260628120000_core_schema.sql` | Enables pgvector; creates all 9 tables (organizations, profiles, brand_kits, assets, projects, project_assets, content_requests, carousels, slides) |
| `20260628120100_row_level_security.sql` | `current_org_id()` helper; enables RLS and org-scoped policies on every table |
| `20260628120200_match_assets_function.sql` | HNSW vector index + `match_assets()` semantic-search function |
| `20260628120300_storage_buckets_and_policies.sql` | `assets` + `renders` buckets (private) with per-org storage policies |
| `20260628120400_seed_encountive_org.sql` | Seeds the single `Encountive` organization (v1) |

## Conventions

- **Multi-tenant:** every row is scoped to an organization via `org_id` (directly
  or through a parent), enforced by Row Level Security.
- **Storage paths** are prefixed with the org id: `{org_id}/<filename>`. The
  storage policies use the first path segment to authorize access.
- **Embeddings** are `vector(768)` — matches a 768-dim Google embedding model.
  If you choose a different model, change the dimension in the assets table and
  in `match_assets`.

## Regenerating types

After any schema change, regenerate `src/lib/database.types.ts`:

```bash
supabase gen types typescript --project-id lbbotfsgkqddzzshmwvw > src/lib/database.types.ts
```
