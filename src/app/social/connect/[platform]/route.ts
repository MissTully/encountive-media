import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  hasLinkedInConfig,
  hasMetaConfig,
  oauthRedirectUri,
  siteOrigin,
} from "@/lib/social/config";
import { linkedInAuthUrl } from "@/lib/social/linkedin";
import { metaAuthUrl } from "@/lib/social/meta";

/**
 * Kick off an OAuth connection: generate a CSRF state, stash it in a
 * short-lived httpOnly cookie, and bounce to the provider's consent screen.
 * `platform` is the provider — `linkedin`, or `meta` (one Meta consent
 * discovers Facebook Pages and their linked Instagram accounts together).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const origin = siteOrigin(request);

  const ctx = await getProfile();
  if (!ctx) return NextResponse.redirect(`${origin}/login`);

  const configured =
    platform === "linkedin"
      ? hasLinkedInConfig()
      : platform === "meta"
        ? hasMetaConfig()
        : false;
  if (!configured) {
    const message =
      platform === "linkedin" || platform === "meta"
        ? `The ${platform === "meta" ? "Meta" : "LinkedIn"} app keys are not configured — see docs/social-publishing-setup.md.`
        : "Unknown platform.";
    return NextResponse.redirect(
      `${origin}/social?notice=${encodeURIComponent(message)}`,
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = oauthRedirectUri(origin, platform as "linkedin" | "meta");
  const authUrl =
    platform === "linkedin"
      ? linkedInAuthUrl(redirectUri, state)
      : metaAuthUrl(redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/social",
    maxAge: 600,
  });
  return response;
}
