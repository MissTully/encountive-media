import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/social/config";
import { exchangeMetaCode, fetchMetaPages } from "@/lib/social/meta";
import {
  exchangeLinkedInCode,
  fetchLinkedInMember,
  fetchLinkedInOrganizations,
} from "@/lib/social/linkedin";

function back(notice: string): NextResponse {
  const res = NextResponse.redirect(
    `${siteUrl()}/social?notice=${encodeURIComponent(notice)}`,
  );
  res.cookies.delete("social_oauth_state");
  return res;
}

/**
 * OAuth callback: verify state, exchange the code, then store one
 * social_connections row per posting destination the grant unlocked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const ctx = await getProfile();
  if (!ctx) return NextResponse.redirect(`${siteUrl()}/login`);
  const orgId = ctx.profile.org_id;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookie = request.cookies.get("social_oauth_state")?.value ?? "";
  const [cookieState, accountScope] = cookie.split(":");
  if (!code || !state || state !== cookieState) {
    return back("Connection cancelled or the sign-in expired — try again.");
  }

  const supabase = await createClient();

  try {
    if (provider === "meta") {
      const userToken = await exchangeMetaCode(code);
      const pages = await fetchMetaPages(userToken);
      if (pages.length === 0) {
        return back(
          "Facebook connected, but no Pages were granted. Posting requires a Facebook Page (Meta's API can't post to personal timelines) — re-connect and select your Page.",
        );
      }
      let count = 0;
      for (const page of pages) {
        const { error } = await supabase.from("social_connections").upsert(
          {
            org_id: orgId,
            provider: "facebook",
            account_scope: "company",
            display_name: page.name,
            external_id: page.id,
            access_token: page.access_token,
            status: "connected",
          },
          { onConflict: "org_id,provider,account_scope,external_id" },
        );
        if (!error) count++;
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          const { error: igError } = await supabase
            .from("social_connections")
            .upsert(
              {
                org_id: orgId,
                provider: "instagram",
                account_scope: "company",
                display_name: `@${ig.username}`,
                external_id: ig.id,
                // IG publishing authenticates with the linked page's token.
                access_token: page.access_token,
                metadata: { page_id: page.id },
                status: "connected",
              },
              { onConflict: "org_id,provider,account_scope,external_id" },
            );
          if (!igError) count++;
        }
      }
      return back(`Connected ${count} Facebook/Instagram destination${count === 1 ? "" : "s"}.`);
    }

    if (provider === "linkedin") {
      const { accessToken, expiresIn } = await exchangeLinkedInCode(code);
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;
      if (accountScope === "company") {
        const orgs = await fetchLinkedInOrganizations(accessToken);
        if (orgs.length === 0) {
          return back(
            "LinkedIn connected, but you don't administer any company pages with this account.",
          );
        }
        for (const org of orgs) {
          await supabase.from("social_connections").upsert(
            {
              org_id: orgId,
              provider: "linkedin",
              account_scope: "company",
              display_name: org.name,
              external_id: org.id,
              access_token: accessToken,
              token_expires_at: expiresAt,
              status: "connected",
            },
            { onConflict: "org_id,provider,account_scope,external_id" },
          );
        }
        return back(`Connected ${orgs.length} LinkedIn company page${orgs.length === 1 ? "" : "s"}.`);
      }
      const member = await fetchLinkedInMember(accessToken);
      await supabase.from("social_connections").upsert(
        {
          org_id: orgId,
          provider: "linkedin",
          account_scope: "personal",
          display_name: member.name,
          external_id: member.id,
          access_token: accessToken,
          token_expires_at: expiresAt,
          status: "connected",
        },
        { onConflict: "org_id,provider,account_scope,external_id" },
      );
      return back(`Connected LinkedIn as ${member.name}.`);
    }

    return back("Unknown provider.");
  } catch (e) {
    return back(
      `Connection failed: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }
}
