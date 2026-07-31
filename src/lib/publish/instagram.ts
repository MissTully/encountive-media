// Instagram Graph API content publishing (business/creator accounts).
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
//
// Instagram's flow is container-based: create a media container per image
// (the API downloads each image from its URL), wait for the container(s) to
// finish processing, then publish. Carousels wrap 2–10 item containers in one
// carousel container. The same submit → poll → finish shape as every other
// async job in this codebase.

import {
  apiCall,
  sleep,
  type PublishInput,
  type PublishVideoInput,
  type PublishResult,
} from "./shared";

const GRAPH = "https://graph.facebook.com/v23.0";
const MAX_CAROUSEL_ITEMS = 10;

async function createContainer(
  igUserId: string,
  token: string,
  params: Record<string, string | boolean>,
): Promise<string> {
  const body = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const { id } = await apiCall<{ id: string }>(
    `${GRAPH}/${igUserId}/media`,
    { method: "POST", body },
    "Instagram container create",
  );
  return id;
}

/** Instagram processes containers asynchronously; publish only when FINISHED. */
async function waitForContainer(
  containerId: string,
  token: string,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status_code } = await apiCall<{ status_code: string }>(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
      "Instagram container status",
    );
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Instagram could not process the media (${status_code})`);
    }
    if (Date.now() > deadline) {
      throw new Error("Instagram media processing timed out");
    }
    await sleep(2500);
  }
}

export async function publishToInstagram(
  input: PublishInput,
): Promise<PublishResult> {
  const { accountRef: igUserId, accessToken: token } = input;
  if (input.imageUrls.length > MAX_CAROUSEL_ITEMS) {
    throw new Error(
      `Instagram carousels allow at most ${MAX_CAROUSEL_ITEMS} images (got ${input.imageUrls.length}).`,
    );
  }

  let containerId: string;
  if (input.imageUrls.length === 1) {
    containerId = await createContainer(igUserId, token, {
      image_url: input.imageUrls[0],
      caption: input.caption,
    });
  } else {
    const children: string[] = [];
    for (const url of input.imageUrls) {
      children.push(
        await createContainer(igUserId, token, {
          image_url: url,
          is_carousel_item: true,
        }),
      );
    }
    await Promise.all(children.map((id) => waitForContainer(id, token)));
    containerId = await createContainer(igUserId, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: input.caption,
    });
  }
  await waitForContainer(containerId, token);

  const { id: mediaId } = await apiCall<{ id: string }>(
    `${GRAPH}/${igUserId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    },
    "Instagram publish",
  );

  // Permalink is a separate lookup; a published post without one is still a
  // success, so don't fail the whole publication over it.
  let postUrl: string | null = null;
  try {
    const { permalink } = await apiCall<{ permalink?: string }>(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
      "Instagram permalink",
    );
    postUrl = permalink ?? null;
  } catch {
    // best effort only
  }
  return { postRef: mediaId, postUrl };
}

/**
 * Publish a single video as a Reel. Same container flow as images, but video
 * processing takes longer, so the wait uses a larger deadline.
 */
export async function publishVideoToInstagram(
  input: PublishVideoInput,
): Promise<PublishResult> {
  const { accountRef: igUserId, accessToken: token } = input;

  const containerId = await createContainer(igUserId, token, {
    media_type: "REELS",
    video_url: input.videoUrl,
    caption: input.caption,
  });
  await waitForContainer(containerId, token, 240_000);

  const { id: mediaId } = await apiCall<{ id: string }>(
    `${GRAPH}/${igUserId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    },
    "Instagram publish",
  );

  let postUrl: string | null = null;
  try {
    const { permalink } = await apiCall<{ permalink?: string }>(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      { method: "GET" },
      "Instagram permalink",
    );
    postUrl = permalink ?? null;
  } catch {
    // best effort only
  }
  return { postRef: mediaId, postUrl };
}
