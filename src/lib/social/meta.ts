// Meta (Facebook + Instagram) integration via the Graph API. One OAuth
// connection discovers every Facebook Page the user manages plus the
// Instagram professional account linked to each Page — the only destinations
// Meta's API can publish to (personal FB profiles are not postable via API).
// Facebook videos publish in one call from a URL; Instagram Reels use the
// container flow (create → poll processing → publish), the same async
// submit → poll → fetch shape as everywhere else in this app.

import { requireEnv } from "@/lib/env";

const GRAPH = "https://graph.facebook.com/v23.0";

// Pages listing + posting, and IG discovery + content publishing.
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

export function metaAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("META_APP_ID"),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: SCOPES.join(","),
  });
  return `https://www.facebook.com/v23.0/dialog/oauth?${params}`;
}

/**
 * Exchange the callback code for a user token, then immediately trade it for
 * a long-lived (~60 day) one — Page tokens derived from it don't expire.
 */
export async function exchangeMetaCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: string | null }> {
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      client_id: requireEnv("META_APP_ID"),
      client_secret: requireEnv("META_APP_SECRET"),
      redirect_uri: redirectUri,
      code,
    })}`,
  );
  const short = (await shortRes.json()) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!shortRes.ok || !short.access_token) {
    throw new Error(
      `Meta token exchange failed: ${short.error?.message ?? shortRes.status}`,
    );
  }

  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: requireEnv("META_APP_ID"),
      client_secret: requireEnv("META_APP_SECRET"),
      fb_exchange_token: short.access_token,
    })}`,
  );
  const long = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  // Long-lived exchange failing is survivable — keep the short token.
  const accessToken = long.access_token ?? short.access_token;
  return {
    accessToken,
    expiresAt: long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null,
  };
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
  instagram: { id: string; username: string } | null;
}

/** Every Page the user manages, with its Page token and linked IG account. */
export async function fetchMetaPages(userToken: string): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let url: string | null = `${GRAPH}/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "50",
    access_token: userToken,
  })}`;
  while (url) {
    const res: Response = await fetch(url);
    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(`Meta pages fetch failed: ${data.error?.message ?? res.status}`);
    }
    for (const p of data.data ?? []) {
      pages.push({
        id: p.id,
        name: p.name,
        accessToken: p.access_token,
        instagram: p.instagram_business_account
          ? {
              id: p.instagram_business_account.id,
              username: p.instagram_business_account.username ?? p.name,
            }
          : null,
      });
    }
    url = data.paging?.next ?? null;
  }
  return pages;
}

/** Publish a video post to a Facebook Page from a (signed) URL. */
export async function publishFacebookVideo(spec: {
  pageId: string;
  pageToken: string;
  videoUrl: string;
  description: string;
}): Promise<{ postId: string; postUrl: string }> {
  const res = await fetch(`${GRAPH}/${spec.pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      file_url: spec.videoUrl,
      description: spec.description,
      access_token: spec.pageToken,
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(`Facebook publish failed: ${data.error?.message ?? res.status}`);
  }
  return {
    postId: data.id,
    postUrl: `https://www.facebook.com/${data.id}`,
  };
}

/**
 * Publish a video to an Instagram professional account as a Reel (the only
 * feed-video type the API supports): create a media container from the URL,
 * poll until Instagram finishes processing it, then publish.
 */
export async function publishInstagramVideo(spec: {
  igUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
  /** How long to wait for Instagram's server-side processing. */
  pollDeadlineMs?: number;
}): Promise<{ postId: string; postUrl: string }> {
  const containerRes = await fetch(`${GRAPH}/${spec.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: spec.videoUrl,
      caption: spec.caption,
      access_token: spec.accessToken,
    }),
  });
  const container = (await containerRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!containerRes.ok || !container.id) {
    throw new Error(
      `Instagram container failed: ${container.error?.message ?? containerRes.status}`,
    );
  }

  // Poll processing; Instagram rejects media_publish until FINISHED.
  const deadline = Date.now() + (spec.pollDeadlineMs ?? 240_000);
  for (;;) {
    const statusRes = await fetch(
      `${GRAPH}/${container.id}?${new URLSearchParams({
        fields: "status_code",
        access_token: spec.accessToken,
      })}`,
    );
    const status = (await statusRes.json()) as { status_code?: string };
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") {
      throw new Error(
        "Instagram could not process the video (check length ≤ 15 min and aspect ratio).",
      );
    }
    if (Date.now() > deadline) {
      throw new Error("Instagram processing timed out — try publishing again.");
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const publishRes = await fetch(`${GRAPH}/${spec.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: spec.accessToken,
    }),
  });
  const published = (await publishRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!publishRes.ok || !published.id) {
    throw new Error(
      `Instagram publish failed: ${published.error?.message ?? publishRes.status}`,
    );
  }

  // Best-effort permalink for the history row.
  const permalinkRes = await fetch(
    `${GRAPH}/${published.id}?${new URLSearchParams({
      fields: "permalink",
      access_token: spec.accessToken,
    })}`,
  );
  const permalink = (await permalinkRes.json().catch(() => null)) as {
    permalink?: string;
  } | null;
  return {
    postId: published.id,
    postUrl: permalink?.permalink ?? "https://www.instagram.com/",
  };
}
