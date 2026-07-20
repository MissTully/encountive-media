# Social publishing setup

The app can publish rendered videos to **LinkedIn**, a **Facebook Page**, and
**Instagram**. The code is fully wired — what remains is one-time setup on
each platform, because LinkedIn and Meta only allow API posting through a
developer app that you register and then authorize against your own accounts.

Once the env vars below are set, open **Social accounts** in the app
(`/social`), click **Connect** for each provider, approve the consent
screens, and the accounts appear as publish destinations on every rendered
video's **Publish** page.

## Important platform limitations (read first)

- **Facebook personal profiles cannot be posted to via the API.** Meta only
  allows API publishing to **Pages**. `facebook.com/missyjotully` is a
  personal profile — to publish, create a Facebook **Page** (or use an
  existing one you admin) and post there.
- **Instagram must be a Professional account linked to that Facebook Page.**
  In the Instagram app: Settings → Account type → switch to **Business** or
  **Creator**, then link it to your Facebook Page (Page Settings → Linked
  accounts → Instagram). `instagram.com/missyjotully` needs this switch
  before the API can publish to it. Videos publish as **Reels** (the only
  video type Instagram's API supports).
- **LinkedIn posts go to the member profile that completes the Connect flow**
  — sign in as `linkedin.com/in/melissajotully` when the consent screen
  appears and posts will land on that profile.

## 1. LinkedIn app

1. Go to <https://developer.linkedin.com/> → **Create app** (it requires
   associating a LinkedIn Page; create a free company Page if you don't have
   one — posts still go to your member profile, the Page is just the app's
   home).
2. In the app's **Products** tab, request:
   - **Share on LinkedIn** (grants `w_member_social` — posting)
   - **Sign In with LinkedIn using OpenID Connect** (grants `openid profile`
     — identifying who connected)
   Both are self-serve and approve instantly.
3. In **Auth** → OAuth 2.0 settings, add the redirect URL for every
   environment you use:
   - `http://localhost:3000/social/callback/linkedin`
   - `https://<your-app>.vercel.app/social/callback/linkedin`
4. Copy the **Client ID** and **Client Secret** into the environment:

   ```
   LINKEDIN_CLIENT_ID=...
   LINKEDIN_CLIENT_SECRET=...
   ```

LinkedIn access tokens last ~60 days and (without partner-program access)
don't auto-refresh — the Social accounts page shows the expiry and flags the
account when a reconnect is needed (one click, same Connect button).

## 2. Meta app (Facebook Page + Instagram)

1. Go to <https://developers.facebook.com/> → **My Apps** → **Create app**
   → type **Business**.
2. Add the **Facebook Login for Business** product. Under its **Settings**,
   add the Valid OAuth Redirect URIs:
   - `http://localhost:3000/social/callback/meta`
   - `https://<your-app>.vercel.app/social/callback/meta`
3. The connect flow requests these permissions: `pages_show_list`,
   `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
   `instagram_content_publish`, `business_management`. While the app is in
   **Development mode** these work immediately for anyone with a role on the
   app (add yourself under **App roles**) — no App Review needed for
   personal/internal use. App Review is only required to open it to the
   public.
4. From **App settings → Basic**, copy the credentials into the environment:

   ```
   META_APP_ID=...
   META_APP_SECRET=...
   ```

One Connect click discovers **every Page you manage** and the **Instagram
professional account linked to each Page**, and adds them all as
destinations. Page tokens don't expire; the Instagram connection rides the
~60-day long-lived token and can be refreshed by reconnecting.

## 3. Where the env vars go

- **Local**: `.env.local`
- **Vercel**: Project → Settings → Environment Variables (then redeploy)

## How publishing works

- Only a **rendered** video (status `ready`) can be published; the Publish
  page is linked from the editor and the videos list.
- Publishing is always manual — pick destinations, write the caption, click
  **Publish now** (build-spec constraint: human approval before publishing).
- Each destination is attempted independently and recorded in
  `social_posts` (status, post link, or the error message), shown as history
  on the Publish page and on `/social`.
- Mechanics per platform:
  - **LinkedIn**: register upload → upload MP4 bytes → wait for processing →
    create the profile post (`w_member_social`).
  - **Facebook Page**: one Graph API call with a signed URL to the MP4.
  - **Instagram**: create a Reels container from the signed URL → poll
    Meta's processing → publish. Reels accepts 3s–15min videos; 9:16
    (1080×1920) renders are the safest fit.
