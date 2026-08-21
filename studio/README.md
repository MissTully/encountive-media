# Encountive Studio (v1)

Campaign studio for [Encountive](https://www.encountive.com) — plan, mix soundtrack or voiceover onto any video, and publish to LinkedIn and Instagram.

This lives in `studio/` so the **existing Next.js / Creatomate app at the repo root is unchanged**. Production at [encountive-media.vercel.app](https://encountive-media.vercel.app) continues to serve that app.

## What ships in v1

- Brand, campaigns, library, review, and publish
- Soundtrack mixer: **music only**, **narration only**, or **both**
- Mix downloads as a local video file
- LinkedIn and Instagram OAuth + publish (needs public media URLs)
- Supabase Storage is wired but optional — connect it when you are ready

## Run locally

```bash
cd studio
npm install
npm run dev
```

## Deploy

Separate Vercel project (`encountive-studio`) with **Root Directory** set to `studio/`. Do not point the existing `encountive-media` Vercel project at this folder.

Set these when you turn on the matching feature:

| Variable | When |
| --- | --- |
| `DATABASE_URL` | Neon Postgres (otherwise embedded PGLite) |
| `VITE_AUTH_ENABLED` | Google / X sign-in |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Public media URLs for Reels / LinkedIn video |
| LinkedIn + Instagram OAuth secrets | Social publish |
