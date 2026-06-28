# n8n Workflow C — Generate Carousel Copy

Implements the copy-generation core of **Workflow C** from the build spec
(section 6): turn a queued `content_requests` row into a carousel with
per-slide copy and chosen background images, ready for human review.

- **n8n workflow:** `Content Studio — Generate Carousel Copy`
  (id `bGYNcYiEbYluiUJE`, in the **Encountive** team project)
- **Status:** v1 verified end-to-end on 2026-06-28 (copy + board reuse).
  Activate the workflow in n8n to run it on a schedule.

## Flow (v1)

```
Schedule Trigger (every 2 min)
  → Get Queued Request   (Supabase: content_requests where status = 'queued', limit 1)
  → Mark Generating      (status = 'generating')
  → Get Board Assets     (Supabase: project_assets for the request's project, by position)
  → Write Slides         (Gemini text → JSON: [{headline, body_copy}], 5–7 slides)   ← executeOnce
  → Create Carousel      (Supabase insert carousels, status = 'in_review')
  → Build Slides         (Code: parse JSON, assign a board image per slide round-robin)
  → Insert Slide         (Supabase insert one slides row per item)
  → Mark In Review       (status = 'in_review')   ← executeOnce
```

## Models / settings

- **Copy:** `gemini-2.5-flash` (Google Gemini node, `text:message`).
  - `thinkingBudget: 0` — **important.** gemini-2.5-flash is a thinking model;
    with thinking enabled its reasoning consumes the token budget and the JSON
    output gets truncated (`finishReason: MAX_TOKENS`), breaking the parse.
    Disable thinking for structured output.
  - `maxOutputTokens: 2048`, `temperature: 0.7`.

## Implementation notes

- One request per run (`limit 1`) keeps the flow a single pass — no nested loop.
- `Write Slides` and `Mark In Review` use `executeOnce: true` because they sit
  after multi-item nodes (board assets / per-slide inserts) but should run once.
- `Build Slides` (Code) unwraps the Gemini `parts[0].text`, strips code fences,
  parses the JSON, and emits one item per slide. Backgrounds are taken from the
  project board round-robin (`board[i % board.length]`).
- If parsing yields 0 slides, no slide rows are written and the request stays
  `generating` (it won't be marked `in_review`) — a useful failure signal.

## Not yet implemented (next iterations)

This v1 covers copy + board reuse. The full spec's Workflow C also needs:

1. **Semantic reuse priority** — per slide, embed an "image need" description and
   pick the best match: project board → wider library via `match_assets` →
   else generate. (v1 just round-robins the board.)
2. **Image generation** — when nothing fits, generate with the Gemini image
   model, upload to the `assets` bucket, insert an `assets` row (with embedding),
   and use it.
3. **Creatomate render** — send copy + chosen background + brand kit to
   Creatomate (submit → poll → fetch), save finished slides to the `renders`
   bucket, set `slides.render_path` / `carousels.output_path`. Requires a
   Creatomate account, API key, and a carousel template.

## Testing

1. Create a project, add ≥1 `ready` asset to its board, and insert a queued
   request:
   ```sql
   insert into public.content_requests (project_id, topic, brief, target_platform, status)
   values ('<project_id>', '<topic>', '<brief>', 'linkedin', 'queued');
   ```
2. Run the workflow. Confirm a `carousels` row + `slides` rows appear with
   headlines/body copy and `asset_id` set, and the request becomes `in_review`.
3. Reset to re-test: `delete from carousels where request_id = '<id>';`
   then `update content_requests set status='queued' where id='<id>';`
