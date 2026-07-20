import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { hasMetaConfig, hasLinkedInConfig, siteUrl } from "@/lib/social/config";
import { metaAuthUrl } from "@/lib/social/meta";
import { linkedinAuthUrl } from "@/lib/social/linkedin";

/**
 * Kick off a provider's OAuth flow. A random state value goes into the
 * provider URL and an httpOnly cookie; the callback compares the two (CSRF
 * protection). For LinkedIn the chosen account scope (personal/company)
 * rides along in the cookie so the callback knows what to fetch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const ctx = await getProfile();
  if (!ctx) return NextResponse.redirect(`${siteUrl()}/login`);

  const accountScope =
    request.nextUrl.searchParams.get("scope") === "company"
      ? "company"
      : "personal";
  const state = crypto.randomUUID();

  let authUrl: string;
  if (provider === "meta" && hasMetaConfig()) {
    authUrl = metaAuthUrl(state);
  } else if (provider === "linkedin" && hasLinkedInConfig()) {
    authUrl = linkedinAuthUrl(state, accountScope);
  } else {
    return NextResponse.redirect(
      `${siteUrl()}/social?notice=${encodeURIComponent(
        "That provider isn't configured yet — see the setup notes on this page.",
      )}`,
    );
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("social_oauth_state", `${state}:${accountScope}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
