// LinkedIn integration: OAuth (Authorization Code + OpenID Connect) and
// member-profile video posts via the Assets + UGC Posts APIs — the flow the
// "Share on LinkedIn" product's w_member_social scope permits. Publishing is
// the same async pattern as rendering: register an upload, push the bytes,
// poll until the asset is processed, then create the post.

import { requireEnv } from "@/lib/env";

const AUTH_BASE = "https://www.linkedin.com/oauth/v2";
const API_BASE = "https://api.linkedin.com/v2";

// w_member_social = post on the member's behalf; openid/profile = identify
// which member connected (userinfo), so the account row has a name + id.
const SCOPES = ["openid", "profile", "w_member_social"];

export function linkedInAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("LINKEDIN_CLIENT_ID"),
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(" "),
  });
  return `${AUTH_BASE}/authorization?${params}`;
}

export async function exchangeLinkedInCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: string | null }> {
  const res = await fetch(`${AUTH_BASE}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `LinkedIn token exchange failed: ${data.error_description ?? res.status}`,
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

/** The connected member's id (`sub`) and display name, via OpenID userinfo. */
export async function fetchLinkedInProfile(
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${API_BASE}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed: ${res.status}`);
  }
  const data = (await res.json()) as { sub: string; name?: string };
  return { id: data.sub, name: data.name ?? "LinkedIn member" };
}

interface LinkedInHeaders {
  [key: string]: string;
}

function apiHeaders(accessToken: string): LinkedInHeaders {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/**
 * Post a video to the connected member's profile. Downloads the MP4 from the
 * signed `videoUrl`, uploads it to LinkedIn, waits for processing, then
 * creates the UGC post. Returns the post URN and a permalink.
 */
export async function publishLinkedInVideo(spec: {
  accessToken: string;
  memberId: string;
  caption: string;
  videoUrl: string;
  /** How long to wait for LinkedIn to process the uploaded video. */
  pollDeadlineMs?: number;
}): Promise<{ postId: string; postUrl: string }> {
  const owner = `urn:li:person:${spec.memberId}`;

  // 1. Register the upload slot.
  const registerRes = await fetch(`${API_BASE}/assets?action=registerUpload`, {
    method: "POST",
    headers: apiHeaders(spec.accessToken),
    body: JSON.stringify({
      registerUploadRequest: {
        owner,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });
  if (!registerRes.ok) {
    throw new Error(
      `LinkedIn upload registration failed: ${await errorText(registerRes)}`,
    );
  }
  const registerData = (await registerRes.json()) as {
    value: {
      asset: string;
      uploadMechanism: Record<
        string,
        { uploadUrl: string; headers?: Record<string, string> }
      >;
    };
  };
  const mechanism = Object.values(registerData.value.uploadMechanism)[0];
  if (!mechanism?.uploadUrl) {
    throw new Error("LinkedIn upload registration returned no upload URL.");
  }
  const asset = registerData.value.asset;

  // 2. Fetch the rendered MP4 and push the bytes to LinkedIn.
  const videoRes = await fetch(spec.videoUrl);
  if (!videoRes.ok) {
    throw new Error(`fetch rendered video: ${videoRes.status}`);
  }
  const videoBytes = await videoRes.arrayBuffer();

  const uploadRes = await fetch(mechanism.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${spec.accessToken}`,
      "Content-Type": "application/octet-stream",
      ...(mechanism.headers ?? {}),
    },
    body: videoBytes,
  });
  if (!uploadRes.ok) {
    throw new Error(`LinkedIn video upload failed: ${uploadRes.status}`);
  }

  // 3. Wait for processing. LinkedIn accepts posts against a still-processing
  // asset, so a timeout here degrades to "post now, LinkedIn finishes later"
  // rather than failing the publish.
  await waitForAsset(spec.accessToken, asset, spec.pollDeadlineMs ?? 120_000);

  // 4. Create the post.
  const postRes = await fetch(`${API_BASE}/ugcPosts`, {
    method: "POST",
    headers: apiHeaders(spec.accessToken),
    body: JSON.stringify({
      author: owner,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: spec.caption },
          shareMediaCategory: "VIDEO",
          media: [{ status: "READY", media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!postRes.ok) {
    throw new Error(`LinkedIn post failed: ${await errorText(postRes)}`);
  }
  const postId =
    postRes.headers.get("x-restli-id") ??
    ((await postRes.json().catch(() => null)) as { id?: string } | null)?.id ??
    "";
  return {
    postId,
    postUrl: postId
      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`
      : "https://www.linkedin.com/feed/",
  };
}

async function waitForAsset(
  accessToken: string,
  assetUrn: string,
  deadlineMs: number,
): Promise<void> {
  const assetId = assetUrn.split(":").pop() ?? "";
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/assets/${assetId}`, {
      headers: apiHeaders(accessToken),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        recipes?: Array<{ status?: string }>;
      };
      const status = data.recipes?.[0]?.status;
      if (status === "AVAILABLE") return;
      if (status === "CLIENT_ERROR" || status === "SERVER_ERROR") {
        throw new Error(`LinkedIn video processing failed (${status}).`);
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? `HTTP ${res.status}`;
}
