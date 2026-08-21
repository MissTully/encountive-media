import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";

export async function handleLinkedInOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${origin}/publish?oauth=missing-linkedin`);
  }

  const user = await getSessionUser();
  if (!user) return Response.redirect(`${origin}/login`);

  const code = url.searchParams.get("code");
  const redirectUri = `${origin}/api/oauth/linkedin`;

  if (!code) {
    const auth = new URL("https://www.linkedin.com/oauth/v2/authorization");
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("scope", "openid profile w_member_social");
    auth.searchParams.set("state", user.id);
    return Response.redirect(auth.toString());
  }

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return Response.redirect(`${origin}/publish?oauth=linkedin-token`);
  }
  const tokenBody = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenBody.access_token) {
    return Response.redirect(`${origin}/publish?oauth=linkedin-token`);
  }

  const me = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profile = me.ok
    ? ((await me.json()) as { sub?: string; name?: string })
    : {};
  const personUrn = profile.sub ? `urn:li:person:${profile.sub}` : "";
  const expiresAt = tokenBody.expires_in
    ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString()
    : null;
  const meta = JSON.stringify({ personUrn });
  const id = `li-${user.id}`;
  const sql = await getSql();
  await sql`delete from social_accounts where user_id = ${user.id} and platform = ${"linkedin"}`;
  await sql`insert into social_accounts (id, user_id, platform, account_name, access_token, refresh_token, expires_at, meta)
    values (${id}, ${user.id}, ${"linkedin"}, ${profile.name ?? "LinkedIn"}, ${tokenBody.access_token}, ${tokenBody.refresh_token ?? null}, ${expiresAt}, ${meta})`;
  return Response.redirect(`${origin}/publish?oauth=linkedin-ok`);
}
