import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";

export async function handleInstagramOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return Response.redirect(`${origin}/publish?oauth=missing-instagram`);
  }

  const user = await getSessionUser();
  if (!user) return Response.redirect(`${origin}/login`);

  const code = url.searchParams.get("code");
  const redirectUri = `${origin}/api/oauth/instagram`;

  if (!code) {
    const auth = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    auth.searchParams.set("client_id", appId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set(
      "scope",
      "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
    );
    auth.searchParams.set("state", user.id);
    return Response.redirect(auth.toString());
  }

  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) return Response.redirect(`${origin}/publish?oauth=instagram-token`);
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenBody.access_token) {
    return Response.redirect(`${origin}/publish?oauth=instagram-token`);
  }

  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=name,access_token,instagram_business_account&access_token=${encodeURIComponent(tokenBody.access_token)}`,
  );
  if (!pagesRes.ok) return Response.redirect(`${origin}/publish?oauth=instagram-pages`);
  const pages = (await pagesRes.json()) as {
    data?: { name?: string; access_token?: string; instagram_business_account?: { id?: string } }[];
  };
  const page = pages.data?.find((p) => p.instagram_business_account?.id);
  const igUserId = page?.instagram_business_account?.id;
  const pageToken = page?.access_token;
  if (!igUserId || !pageToken) {
    return Response.redirect(`${origin}/publish?oauth=instagram-ig`);
  }

  const meta = JSON.stringify({ igUserId, pageName: page.name });
  const id = `ig-${user.id}`;
  const sql = await getSql();
  await sql`delete from social_accounts where user_id = ${user.id} and platform = ${"instagram"}`;
  await sql`insert into social_accounts (id, user_id, platform, account_name, access_token, meta)
    values (${id}, ${user.id}, ${"instagram"}, ${page.name ?? "Instagram"}, ${pageToken}, ${meta})`;
  return Response.redirect(`${origin}/publish?oauth=instagram-ok`);
}
