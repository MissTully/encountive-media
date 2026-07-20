# Test report — 2026-07-19

Full check of the app, database, and both n8n automations, plus the fixes and
features that came out of it. Environment: live Supabase project
`lbbotfsgkqddzzshmwvw`, deployed app `encountive-media.vercel.app`.

## What was tested

| Area | Result |
| --- | --- |
| `next build` + `eslint` + `tsc --noEmit` | ✅ clean |
| Auth redirects (`/`, `/library` → `/login` when signed out) | ✅ works (local dev server) |
| Login page renders with Google sign-in | ✅ works |
| Profile auto-provisioning (`handle_new_user` trigger) | ✅ verified with a temporary test user (created + deleted); new users land in the Encountive org as `editor` |
| `match_assets()` semantic search function | ✅ correct ranking (query with a manta-ray embedding → manta ray 1.0, octopus 0.70, cruise photos ~0.58) |
| `pick_slide_asset()` board-first selection | ✅ returns the board asset with `from_board = true` |
| Storage buckets + org-scoped policies | ✅ `assets` (252 objects) and `renders` present, private, org-prefixed paths |
| RLS on all 9 tables | ✅ enabled; advisors show no missing-RLS errors |
| Supabase security advisors | ⚠️ 2 SECURITY DEFINER functions were API-callable → fixed by migration `20260719221500_harden_function_grants.sql` (applied + verified the auth trigger still provisions profiles). Remaining warnings: `vector` extension in `public` schema (cosmetic), leaked-password protection off (enable in dashboard if desired) |
| n8n Workflow A (auto-title & embed) | ❌ **failing** — see below |
| n8n Workflow C (carousel generation) | ❌ **failing** — see below |

## The automation outage (root cause)

Both n8n workflows are running on schedule but **die at their first Gemini API
call**. Evidence from Supabase API logs (all Supabase calls return 200):

- **Workflow A**, every 2 min: `GET assets?status=uploaded` → `PATCH` one asset
  to `analyzing` → `GET` the image from storage → **silence** (no title/embedding
  write-back). Each run strands one more asset at `analyzing`.
- **Workflow C**: after re-queueing the stuck request as a live test, n8n picked
  it up within 2 minutes (`queued → generating`), fetched the project board,
  then went silent before the "Write Slides" Gemini step could insert a
  carousel.

Timeline: a bulk upload of ~244 images ran 20:31–21:35 UTC. Workflow A
processed a handful until 20:37, then Gemini calls started failing — consistent
with an exhausted Gemini quota (free-tier daily/rate limits) or a broken key in
the n8n `googlePalmApi` credential. **Fix in n8n:** check the workflow execution
log and the Gemini credential/quota. State at test time: 215 `uploaded`,
29 stranded `analyzing`, 8 `ready`; the reef-animals request stuck at
`generating` with no carousel.

## What was built in response

1. **In-app Workflow A fallback** — library page shows a pending-images banner
   with **Analyze next batch** (vision + embedding for 6 images per click) and
   **Reset stuck** (flips `analyzing` strays back to `uploaded`). Failed assets
   revert to `uploaded` instead of stranding.
2. **In-app Workflow C** (`Generate now` on the request page) — full pipeline:
   Gemini copywriting → per-slide embedding → `pick_slide_asset` (board → library)
   → **new: Gemini image generation** when nothing clears the 0.5 threshold
   (saved back to the library with embedding for future reuse) → **new:
   Creatomate render persisted to the private `renders` bucket** +
   `carousels.output_path`. Failed runs delete the partial carousel and
   re-queue the request. Rendering is skipped gracefully without
   `CREATOMATE_API_KEY`.
3. **Security hardening migration** (see table above).
4. **Fixes:** home-page roadmap now shows all 8 phases done; `.env.example`
   created (README referenced it but it didn't exist); requests stuck at
   `generating` now show a recovery button.

## Environment variables the deployed app needs (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already set
  (app is live)
- `GOOGLE_GEMINI_API_KEY` — required for semantic search + all new in-app
  generation (probably already set; note it may share the exhausted quota with
  n8n — if so, in-app generation recovers when the quota resets)
- `CREATOMATE_API_KEY` — **new, optional**: enables in-app rendering. Copy the
  key from the n8n Bearer Auth credential.

## Not testable from this session

- Google OAuth end-to-end (needs a real Google account in a browser).
- Creatomate rendering (no API key available here) — the render code follows
  the submit → poll → fetch pattern from the spec and the n8n flow's inline
  source, but needs one live run to confirm.
- n8n workflow internals (no n8n API access) — diagnosis is from DB state and
  Supabase API logs.
