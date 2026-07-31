// LinkedIn publishing via the versioned REST API (Posts + Images).
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
//
// Unlike Meta, LinkedIn does not download images from a URL: we initialize an
// upload per image, PUT the bytes ourselves, then create the post referencing
// the returned image URNs. Requires a token with w_organization_social (for
// organization authors) and the account's external_id stored as the full
// author URN, e.g. urn:li:organization:12345.

import {
  apiCall,
  type PublishInput,
  type PublishVideoInput,
  type PublishResult,
} from "./shared";

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

/**
 * Publish a single video. LinkedIn's Videos API needs the file size up front,
 * returns one or more byte-range upload instructions, and requires the ETag
 * of every uploaded part to finalize before the post can reference the URN.
 */
export async function publishVideoToLinkedIn(
  input: PublishVideoInput,
): Promise<PublishResult> {
  const { accountRef: authorUrn, accessToken: token } = input;

  // LinkedIn does not fetch from URLs — download the MP4 ourselves first.
  const videoRes = await fetch(input.videoUrl);
  if (!videoRes.ok) {
    throw new Error(`fetching video for LinkedIn failed (${videoRes.status})`);
  }
  const bytes = new Uint8Array(await videoRes.arrayBuffer());

  const init = await apiCall<{
    value: {
      video: string;
      uploadToken: string;
      uploadInstructions: Array<{
        uploadUrl: string;
        firstByte: number;
        lastByte: number;
      }>;
    };
  }>(
    `${API}/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes: bytes.byteLength,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    },
    "LinkedIn video init",
  );

  const etags: string[] = [];
  for (const part of init.value.uploadInstructions) {
    const putRes = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: new Blob([
        bytes.slice(part.firstByte, part.lastByte + 1) as unknown as BlobPart,
      ]),
    });
    if (!putRes.ok) {
      throw new Error(`LinkedIn video upload failed (${putRes.status})`);
    }
    const etag = putRes.headers.get("etag");
    if (!etag) throw new Error("LinkedIn upload returned no ETag");
    etags.push(etag);
  }

  await apiCall(
    `${API}/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: init.value.video,
          uploadToken: init.value.uploadToken,
          uploadedPartIds: etags,
        },
      }),
    },
    "LinkedIn video finalize",
  );

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
      content: { media: { id: init.value.video } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn post create failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  const postUrn = res.headers.get("x-restli-id");
  if (!postUrn) throw new Error("LinkedIn did not return a post id");
  return {
    postRef: postUrn,
    postUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
  };
}
