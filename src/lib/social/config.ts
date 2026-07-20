// Shared configuration for the social publishing integrations. Two OAuth
// apps power three destinations: a LinkedIn app (member-profile posts) and a
// Meta app (Facebook Pages + the Instagram professional accounts linked to
// them). See docs/social-publishing-setup.md for the one-time platform setup.

export type SocialPlatform = "linkedin" | "facebook" | "instagram";

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook Page",
  instagram: "Instagram",
};

export function hasLinkedInConfig(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
  );
}

export function hasMetaConfig(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

/**
 * The user-facing origin for building OAuth redirect URIs — behind Vercel's
 * proxy the request origin is the internal host, so prefer `x-forwarded-host`
 * (same handling as the Supabase auth callback).
 */
export function siteOrigin(request: Request): string {
  const { origin } = new URL(request.url);
  if (process.env.NODE_ENV === "development") return origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  return forwardedHost ? `https://${forwardedHost}` : origin;
}

/** Registered callback path per provider (one Meta callback covers FB + IG). */
export function oauthRedirectUri(
  origin: string,
  provider: "linkedin" | "meta",
): string {
  return `${origin}/social/callback/${provider}`;
}

/** Name of the short-lived cookie carrying the OAuth CSRF state. */
export const OAUTH_STATE_COOKIE = "social_oauth_state";

/**
 * Whether a stored token's expiry has passed (null = the platform reported
 * no expiry). Lives here rather than inline in pages: reading the clock is
 * impure, and both /social and the publish page are dynamically rendered so
 * the value is fresh per request.
 */
export function tokenExpired(tokenExpiresAt: string | null): boolean {
  return (
    tokenExpiresAt !== null && new Date(tokenExpiresAt).getTime() < Date.now()
  );
}
