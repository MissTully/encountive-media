# n8n Workflow A — Auto-title & Embed Images

Implements **Workflow A** from the build spec (section 6): when images are
uploaded to the library, analyze them with Gemini vision and make them
searchable, then mark them `ready`.

- **n8n workflow:** `Content Studio — Auto-title & Embed Images`
  (id `cqs9O5xniQsOGFZY`, in the **Encountive** team project)
- **Status:** verified end-to-end on 2026-06-28. Activate the workflow in n8n to
  run it on a schedule.

## Flow

```
Schedule Trigger (every 2 min)
  → Get Pending Images   (Supabase: assets where status = 'uploaded', limit 5)
  → Loop Over Images (batchSize 1):
      → Mark Analyzing   (Supabase: set status = 'analyzing')   ← claims the row so the next poll skips it
      → Download Image   (HTTP GET Supabase Storage, binary)
      → Describe Image   (Gemini vision → JSON: title, description, tags)
      → Parse Description (Code: unwrap parts[0].text, parse JSON)
      → Create Embedding (HTTP POST Gemini embeddings, 768-dim)
      → Save Results     (HTTP PATCH assets: title/description/tags/embedding, status = 'ready')
```

## Models

- **Vision / titling:** `gemini-2.5-flash` (Google Gemini node, `image:analyze`).
- **Embeddings:** `gemini-embedding-001` via REST `:embedContent` with
  `outputDimensionality: 768` to match the `assets.embedding vector(768)` column.
  > Note: `text-embedding-004` was retired — calling it returns a 404 from the
  > `v1beta` API. Use `gemini-embedding-001`.

## Credentials (n8n)

| Node(s) | Credential type | Points at |
| --- | --- | --- |
| Get Pending Images, Mark Analyzing, Download Image, Save Results | `supabaseApi` | Encountive Media project (`lbbotfsgkqddzzshmwvw`), **service_role** key |
| Describe Image, Create Embedding | `googlePalmApi` | a Google Gemini API key |

- HTTP Request nodes can only have their credential set in the n8n UI (the API
  cannot assign a "predefined credential type" — pick it in the node's dropdown).
- The Supabase credential **must** target the Encountive Media project. A
  credential for a different Supabase project will authenticate but read/write
  the wrong database.

## Implementation notes

- **Storage download** uses the Supabase Storage REST endpoint
  `…/storage/v1/object/assets/{storage_path}` with the `supabaseApi` predefined
  credential (service_role), since the bucket is private.
- **Gemini response shape:** the vision node returns the model text at
  `content.parts[0].text` (not a plain string). Parse Description unwraps that
  before `JSON.parse`.
- **pgvector write:** the embedding is sent to PostgREST as a JSON string
  (`JSON.stringify(values)` → `"[…]"`); `tags` is sent as a JSON array → `text[]`.
- **Idempotency:** `Mark Analyzing` runs before the slow AI calls so a second
  poll won't pick up the same row. A row that errors mid-run stays `analyzing`
  (it won't be retried automatically) — see Limitations.

## How to test manually

1. Upload an image to the `assets` bucket (Supabase Storage), e.g. under
   `{org_id}/file.jpg`.
2. Insert a row so the workflow has work to do:
   ```sql
   insert into public.assets (org_id, storage_path, source, status, mime_type)
   values ('<org_id>', '<object path in bucket>', 'uploaded', 'uploaded', 'image/jpeg');
   ```
3. Run the workflow (manually, or wait for the schedule). Confirm the row flips
   to `status = 'ready'` with `title`, `tags`, `description`, and a 768-dim
   `embedding`.
4. To re-test the same row: `update public.assets set status='uploaded',
   title=null, description=null, tags='{}', embedding=null where id='…';`

## In-app fallback (added 2026-07-19)

The library page now has an **Analyze next batch** button that runs this same
pipeline inside the app (`src/app/library/actions.ts` → `src/lib/gemini.ts`),
using the app's `GOOGLE_GEMINI_API_KEY`. Unlike this n8n flow it reverts an
asset to `uploaded` when a step fails, so nothing is stranded. A **Reset stuck**
button flips `analyzing` rows back to `uploaded`.

Context: on 2026-07-19 a bulk upload of ~244 images stalled — this workflow's
Gemini calls began failing (quota/credential), and each 2-minute run stranded
one more asset at `analyzing` (Supabase API logs show fetch → mark analyzing →
download → then silence, all Supabase calls 200). Check the n8n execution log
and the Gemini key/quota in the `googlePalmApi` credential.

## Limitations / future hardening

- **Stuck `analyzing`:** if a row errors after Mark Analyzing, it stays
  `analyzing` and won't retry. Add a sweep that resets rows stuck in `analyzing`
  for > N minutes back to `uploaded`, or add an error branch. (The in-app
  **Reset stuck** button is the manual version of this sweep.)
- **Polling vs. realtime:** a 2-minute poll is simple and self-contained. For
  near-realtime, replace the Schedule trigger with a Supabase Database Webhook
  on insert into `assets`.
- **Object names with spaces** work, but the app generates clean
  `{org_id}/{uuid}.{ext}` keys, so production paths won't contain spaces.
