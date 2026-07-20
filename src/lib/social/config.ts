// Environment plumbing for social publishing. Each provider is enabled by
// its own app credentials; the /social page shows exactly what's missing so
// setup is self-explanatory.
//
//   Meta (Facebook Pages + Instagram):
//     META_APP_ID, META_APP_SECRET      — a Meta app with Facebook Login,
//     pages_manage_posts / instagram_content_publish permissions approved.
//   LinkedIn:
//     LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET — a LinkedIn app with the
//     "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect"
//     products (plus Community Management API for company pages).
//   Both:
//     NEXT_PUBLIC_SITE_URL — the exact origin registered as the OAuth
//     redirect base, e.g. https://encountive-media.vercel.app

export function hasMetaConfig(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function hasLinkedInConfig(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
  );
}

/** The app's public origin, used to build OAuth redirect URIs. */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function redirectUri(provider: "meta" | "linkedin"): string {
  return `${siteUrl()}/api/social/${provider}/callback`;
}
