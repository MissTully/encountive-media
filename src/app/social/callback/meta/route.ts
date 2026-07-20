import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  OAUTH_STATE_COOKIE,
  oauthRedirectUri,
  siteOrigin,
} from "@/lib/social/config";
import { exchangeMetaCode, fetchMetaPages } from "@/lib/social/meta";

/**
 * Meta OAuth callback: verify the CSRF state, exchange for a long-lived
 * token, then discover every Facebook Page the user manages and each Page's
 * linked Instagram professional account — one account row per destination.
 * Personal Facebook profiles can't be posted to via the API, so a user with
 * no Pages gets a pointer to the setup doc instead of silent success.
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
      `Facebook connection was cancelled${searchParams.get("error_description") ? `: ${searchParams.get("error_description")}` : "."}`,
    );
  }
  if (!state || state !== expectedState) {
    return back("Facebook connection failed a security check — try again.");
  }

  try {
    const { accessToken, expiresAt } = await exchangeMetaCode(
      code,
      oauthRedirectUri(origin, "meta"),
    );
    const pages = await fetchMetaPages(accessToken);
    if (pages.length === 0) {
      return back(
        "Connected, but this Facebook account manages no Pages. The API can only post to a Page (not a personal profile) — create one and link your Instagram to it, then reconnect. See docs/social-publishing-setup.md.",
      );
    }

    // Page tokens derived from a long-lived user token don't expire, so the
    // rows carry no expiry; the IG rows publish with the Page's token.
    const rows = pages.flatMap((page) => {
      const pageRow = {
        org_id: ctx.profile.org_id,
        platform: "facebook",
        external_id: page.id,
        display_name: page.name,
        access_token: page.accessToken,
        token_expires_at: null as string | null,
        metadata: {},
        connected_by: ctx.profile.id,
      };
      const igRow = page.instagram
        ? [
            {
              org_id: ctx.profile.org_id,
              platform: "instagram",
              external_id: page.instagram.id,
              display_name: `@${page.instagram.username}`,
              access_token: page.accessToken,
              token_expires_at: expiresAt,
              metadata: { page_id: page.id },
              connected_by: ctx.profile.id,
            },
          ]
        : [];
      return [pageRow, ...igRow];
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("social_accounts")
      .upsert(rows, { onConflict: "org_id,platform,external_id" });
    if (error) throw new Error(error.message);

    const igCount = pages.filter((p) => p.instagram).length;
    return back(
      `Connected ${pages.length} Facebook Page${pages.length === 1 ? "" : "s"}` +
        (igCount > 0
          ? ` and ${igCount} Instagram account${igCount === 1 ? "" : "s"}.`
          : ". No linked Instagram professional account was found — link one to your Page and reconnect to add it."),
    );
  } catch (e) {
    return back(e instanceof Error ? e.message : "Facebook connection failed.");
  }
}
