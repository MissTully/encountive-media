// Meta (Facebook Pages + Instagram) integration.
//
// One OAuth flow covers both networks: the user signs in with Facebook and
// grants page + Instagram permissions; we then store one connection per
// Facebook Page and one per linked Instagram business/creator account.
// Note: Meta's API only supports posting to Pages and IG business accounts —
// personal Facebook timelines cannot be posted to via the API (the /social
// page explains this during setup).

import { redirectUri } from "./config";

const GRAPH = "https://graph.facebook.com/v21.0";

const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function metaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri("meta"),
    state,
    scope: OAUTH_SCOPES,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${GRAPH}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || body.error) {
    throw new Error(`Meta API ${path}: ${body.error?.message ?? res.status}`);
  }
  return body;
}

async function graphPost<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || body.error) {
    throw new Error(`Meta API ${path}: ${body.error?.message ?? res.status}`);
  }
  return body;
}

/** Exchange the OAuth code for a long-lived user token (~60 days). */
export async function exchangeMetaCode(code: string): Promise<string> {
  const shortLived = await graphGet<{ access_token: string }>(
    "/oauth/access_token",
    {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri("meta"),
      code,
    },
  );
  const longLived = await graphGet<{ access_token: string }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: shortLived.access_token,
    },
  );
  return longLived.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string; // page token — what all posting uses
  instagram_business_account?: { id: string; username: string };
}

/** The user's Pages and any linked Instagram business accounts. */
export async function fetchMetaPages(userToken: string): Promise<MetaPage[]> {
  const res = await graphGet<{ data: MetaPage[] }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: userToken,
  });
  return res.data ?? [];
}

/** Post one or more photos to a Facebook Page; returns the post URL. */
export async function publishFacebookImages(spec: {
  pageId: string;
  pageToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<string> {
  // Upload each photo unpublished, then attach them all to one feed post.
  const mediaIds: string[] = [];
  for (const url of spec.imageUrls) {
    const photo = await graphPost<{ id: string }>(`/${spec.pageId}/photos`, {
      url,
      published: "false",
      access_token: spec.pageToken,
    });
    mediaIds.push(photo.id);
  }
  const params: Record<string, string> = {
    message: spec.caption,
    access_token: spec.pageToken,
  };
  mediaIds.forEach((id, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const post = await graphPost<{ id: string }>(`/${spec.pageId}/feed`, params);
  const link = await graphGet<{ permalink_url?: string }>(`/${post.id}`, {
    fields: "permalink_url",
    access_token: spec.pageToken,
  });
  return link.permalink_url ?? `https://www.facebook.com/${post.id}`;
}

/** Post a video to a Facebook Page from a URL; returns the post URL. */
export async function publishFacebookVideo(spec: {
  pageId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
}): Promise<string> {
  const video = await graphPost<{ id: string }>(`/${spec.pageId}/videos`, {
    file_url: spec.videoUrl,
    description: spec.caption,
    access_token: spec.pageToken,
  });
  return `https://www.facebook.com/${spec.pageId}/videos/${video.id}`;
}

/** Wait for an IG media container to finish server-side processing. */
async function waitForContainer(
  containerId: string,
  token: string,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await graphGet<{ status_code: string }>(`/${containerId}`, {
      fields: "status_code",
      access_token: token,
    });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") {
      throw new Error("Instagram could not process the media.");
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for Instagram to process the media.");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** Publish image(s) to an Instagram business account; returns the post URL. */
export async function publishInstagramImages(spec: {
  igUserId: string;
  pageToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<string> {
  let creationId: string;
  if (spec.imageUrls.length === 1) {
    const container = await graphPost<{ id: string }>(`/${spec.igUserId}/media`, {
      image_url: spec.imageUrls[0],
      caption: spec.caption,
      access_token: spec.pageToken,
    });
    creationId = container.id;
  } else {
    const children: string[] = [];
    for (const url of spec.imageUrls.slice(0, 10)) {
      const child = await graphPost<{ id: string }>(`/${spec.igUserId}/media`, {
        image_url: url,
        is_carousel_item: "true",
        access_token: spec.pageToken,
      });
      children.push(child.id);
    }
    const container = await graphPost<{ id: string }>(`/${spec.igUserId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: spec.caption,
      access_token: spec.pageToken,
    });
    creationId = container.id;
  }
  const published = await graphPost<{ id: string }>(
    `/${spec.igUserId}/media_publish`,
    { creation_id: creationId, access_token: spec.pageToken },
  );
  const media = await graphGet<{ permalink?: string }>(`/${published.id}`, {
    fields: "permalink",
    access_token: spec.pageToken,
  });
  return media.permalink ?? "https://www.instagram.com";
}

/** Publish a video (as a Reel) to an Instagram business account. */
export async function publishInstagramVideo(spec: {
  igUserId: string;
  pageToken: string;
  caption: string;
  videoUrl: string;
}): Promise<string> {
  const container = await graphPost<{ id: string }>(`/${spec.igUserId}/media`, {
    media_type: "REELS",
    video_url: spec.videoUrl,
    caption: spec.caption,
    access_token: spec.pageToken,
  });
  // Video containers process asynchronously — poll before publishing.
  await waitForContainer(container.id, spec.pageToken);
  const published = await graphPost<{ id: string }>(
    `/${spec.igUserId}/media_publish`,
    { creation_id: container.id, access_token: spec.pageToken },
  );
  const media = await graphGet<{ permalink?: string }>(`/${published.id}`, {
    fields: "permalink",
    access_token: spec.pageToken,
  });
  return media.permalink ?? "https://www.instagram.com";
}
