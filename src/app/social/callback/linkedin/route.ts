import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  oauthRedirectUri,
  siteOrigin,
} from "@/lib/social/config";
import { exchangeLinkedInCode, fetchLinkedInProfile } from "@/lib/social/linkedin";

/**
 * LinkedIn OAuth callback: verify the CSRF state, trade the code for an
 * access token, identify the member, and upsert the account row (so
 * reconnecting refreshes the token instead of duplicating the account).
 */
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const back = (message: string) => {
    const res = NextResponse.redirect(
      `${origin}/social?notice=${encodeURIComponent(message)}`,
    );
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  const ctx = await getProfile();
  if (!ctx) return NextResponse.redirect(`${origin}/login`);

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code) {
    return back(
      `LinkedIn connection was cancelled${searchParams.get("error_description") ? `: ${searchParams.get("error_description")}` : "."}`,
    );
  }
  if (!state || state !== expectedState) {
    return back("LinkedIn connection failed a security check — try again.");
  }

  try {
    const { accessToken, expiresAt } = await exchangeLinkedInCode(
      code,
      oauthRedirectUri(origin, "linkedin"),
    );
    const profile = await fetchLinkedInProfile(accessToken);

    const supabase = await createClient();
    const { error } = await supabase.from("social_accounts").upsert(
      {
        org_id: ctx.profile.org_id,
        platform: "linkedin",
        external_id: profile.id,
        display_name: profile.name,
        access_token: accessToken,
        token_expires_at: expiresAt,
        connected_by: ctx.profile.id,
      },
      { onConflict: "org_id,platform,external_id" },
    );
    if (error) throw new Error(error.message);

    return back(`LinkedIn connected as ${profile.name}.`);
  } catch (e) {
    return back(e instanceof Error ? e.message : "LinkedIn connection failed.");
  }
}
