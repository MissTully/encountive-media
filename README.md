# Encountive Content Studio

Marketing content generation for software products — carousels first, video later.
Version 1 produces **social-media image carousels** for internal use by Encountive.

> Working name. See [`docs/encountive-content-studio-build-spec.md`](docs/encountive-content-studio-build-spec.md)
> for the full build specification (data model, workflows, constraints, scope).

## Two apps in this repo

| Path | Stack | Live |
| --- | --- | --- |
| **Repo root** | Next.js + Creatomate | [encountive-media.vercel.app](https://encountive-media.vercel.app) |
| **[`studio/`](./studio)** | TanStack Start — mixer, LinkedIn / Instagram publish | New Vercel project `encountive-studio` (root directory `studio/`) |

The Next.js production app is **not** replaced by Studio. Do not change the existing Vercel project's root directory.

## Stack

- **Next.js** (App Router, TypeScript) + **Tailwind CSS**
- **Supabase** — Postgres, Storage, Auth, and `pgvector` for semantic search
- **n8n** — orchestration for the async generate/render pipeline
- **Google Gemini** — copywriting, vision auto-titling, image generation, embeddings
- **Creatomate** — render layer (text overlaid on visuals; text is never baked into AI images)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then fill in your Supabase URL + anon key (and other keys as you build)

# 3. Run the dev server
npm run dev
```

Open <http://localhost:3000>. The landing page shows whether your Supabase
environment is detected and tracks the build roadmap.

## Authentication (Google OAuth)

Sign-in uses Supabase Auth with the Google provider. On first sign-in a
`profiles` row is auto-created (DB trigger) linking the user to the Encountive
organization. One-time setup outside the codebase:

1. **Google Cloud Console** → APIs & Services → Credentials → create an
   **OAuth client ID** (type: Web application). Add this Authorized redirect URI:
   `https://lbbotfsgkqddzzshmwvw.supabase.co/auth/v1/callback`
2. **Supabase dashboard** → Authentication → Providers → **Google**: enable it
   and paste the Google **Client ID** and **Client secret**.
3. **Supabase dashboard** → Authentication → URL Configuration: set the **Site
   URL** and add **Redirect URLs** for both `http://localhost:3000/**` and your
   Vercel domain `https://<your-app>.vercel.app/**`.
4. (Recommended for an internal tool) restrict who can sign in — Supabase Auth
   lets you limit allowed email domains or disable new sign-ups. Otherwise any
   Google account that completes sign-in is added to the Encountive org.

## Project structure

```
src/
  app/                 # Next.js App Router pages
  lib/
    env.ts             # env-var helpers
    supabase/
      client.ts        # browser Supabase client (Client Components)
      server.ts        # server Supabase client (Server Components / Actions / Routes)
      middleware.ts    # session-refresh helper used by src/proxy.ts
  proxy.ts             # keeps the Supabase auth session fresh on every request
  types/index.ts       # domain types mirroring the spec's data model
docs/                  # build specification
studio/                # Encountive Studio v1 (TanStack Start) — mixer + social publish
```

## Key constraints (from the spec)

1. **Multi-tenant from day one** — every table carries `org_id`, protected by Row Level Security.
2. **No Midjourney** in the automated pipeline — use Google's image models.
3. **Text is overlaid at the render layer**, never generated into images.
4. **Async job pattern** — submit → poll status → fetch file; one reusable polling sub-flow.
5. **Human approval before publishing** — nothing auto-publishes in v1.

## Build roadmap

1. ✅ Scaffold app + Supabase client setup
2. ✅ Database schema — tables, pgvector, RLS, `match_assets`
3. ✅ Bulk image upload + auth (Google OAuth)
4. ✅ Vision auto-titling + embeddings ([n8n Workflow A](docs/n8n-workflow-a.md) + in-app fallback)
5. ✅ Asset library with keyword + semantic search
6. ✅ Projects & boards (Workflow B)
7. ✅ Carousel generation — copy + reuse (board→library) + image-gen fallback + Creatomate render persisted to the `renders` bucket ([Workflow C](docs/n8n-workflow-c.md) + in-app **Generate now**)
8. ✅ Review / approval screen

All phases are built. See [`docs/test-report-2026-07-19.md`](docs/test-report-2026-07-19.md)
for the full end-to-end test pass and the n8n outage diagnosis.

## Publishing to social media

Approval is no longer the end of the line: an approved carousel can be posted
straight to **Instagram**, **Facebook**, or **LinkedIn** from its review
screen, via each platform's official API (no third-party scheduler).

- **Connections** (`/connections`) — connect destinations by pasting the
  platform-side id and a long-lived token: an IG business-account id (Meta app
  with `instagram_content_publish`), a Facebook Page id (`pages_manage_posts`
  Page token), or a LinkedIn author URN (`w_organization_social` token).
- **Publish panel** — on an approved request, pick a destination, edit the
  prefilled caption, press **Publish now**. Instagram/Facebook fetch the
  rendered slides from short-lived signed URLs; LinkedIn uploads the bytes.
- **Publish log** — every attempt is a `publications` row (publishing →
  published/failed) shown on the review screen with the post permalink or the
  platform's error; a failed attempt is retried by pressing publish again.

Human approval stays mandatory — nothing publishes until a person has
approved the carousel and pressed the button. Tokens live in the
`social_accounts` table (org-scoped RLS); move them to a proper secret store
before offering this to external tenants.

## Generation runs in two places

The n8n workflows poll on a schedule; the app can also run the same pipelines
directly (library → **Analyze next batch**, request page → **Generate now**).
The in-app versions claim rows by status (`uploaded → analyzing`,
`queued → generating`) so the two never double-process, and they recover work
a crashed n8n run left stranded. In-app generation needs `GOOGLE_GEMINI_API_KEY`
(and optionally `CREATOMATE_API_KEY`) — see `.env.example`.
