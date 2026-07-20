// LinkedIn publishing via the versioned REST API (Posts + Images).
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
//
// Unlike Meta, LinkedIn does not download images from a URL: we initialize an
// upload per image, PUT the bytes ourselves, then create the post referencing
// the returned image URNs. Requires a token with w_organization_social (for
// organization authors) and the account's external_id stored as the full
// author URN, e.g. urn:li:organization:12345.

import { apiCall, type PublishInput, type PublishResult } from "./shared";

const API = "https://api.linkedin.com/rest";
// Update alongside LinkedIn's monthly versioning; versions stay live ~1 year.
const LINKEDIN_VERSION = "202506";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

async function uploadImage(
  imageUrl: string,
  authorUrn: string,
  token: string,
): Promise<string> {
  const init = await apiCall<{
    value: { uploadUrl: string; image: string };
  }>(
    `${API}/images?action=initializeUpload`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    },
    "LinkedIn image init",
  );

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`fetching slide for LinkedIn failed (${imageRes.status})`);
  }
  const bytes = await imageRes.arrayBuffer();

  const putRes = await fetch(init.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(`LinkedIn image upload failed (${putRes.status})`);
  }
  return init.value.image;
}

export async function publishToLinkedIn(
  input: PublishInput,
): Promise<PublishResult> {
  const { accountRef: authorUrn, accessToken: token } = input;

  const imageUrns: string[] = [];
  for (const url of input.imageUrls) {
    imageUrns.push(await uploadImage(url, authorUrn, token));
  }

  const content =
    imageUrns.length === 1
      ? { media: { id: imageUrns[0] } }
      : { multiImage: { images: imageUrns.map((id) => ({ id })) } };

  const res = await fetch(`${API}/posts`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      author: authorUrn,
      commentary: input.caption,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content,
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn post create failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  // The created post URN comes back in a header, not the body.
  const postUrn = res.headers.get("x-restli-id");
  if (!postUrn) throw new Error("LinkedIn did not return a post id");
  return {
    postRef: postUrn,
    postUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
  };
}
