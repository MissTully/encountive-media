// Facebook Page publishing via the Graph API.
// Docs: https://developers.facebook.com/docs/pages-api/posts
//
// Multi-image posts are two steps: upload each photo unpublished (the API
// downloads it from our URL), then create one feed post that attaches all of
// them. Requires a Page access token with pages_manage_posts.

import { apiCall, type PublishInput, type PublishResult } from "./shared";

const GRAPH = "https://graph.facebook.com/v23.0";

export async function publishToFacebook(
  input: PublishInput,
): Promise<PublishResult> {
  const { accountRef: pageId, accessToken: token } = input;

  const photoIds: string[] = [];
  for (const url of input.imageUrls) {
    const { id } = await apiCall<{ id: string }>(
      `${GRAPH}/${pageId}/photos`,
      {
        method: "POST",
        body: new URLSearchParams({
          url,
          published: "false",
          access_token: token,
        }),
      },
      "Facebook photo upload",
    );
    photoIds.push(id);
  }

  const body = new URLSearchParams({
    message: input.caption,
    access_token: token,
  });
  photoIds.forEach((id, i) => {
    body.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
  });

  const { id: postId } = await apiCall<{ id: string }>(
    `${GRAPH}/${pageId}/feed`,
    { method: "POST", body },
    "Facebook post create",
  );
  return { postRef: postId, postUrl: `https://www.facebook.com/${postId}` };
}
