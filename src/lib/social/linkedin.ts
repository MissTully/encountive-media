// LinkedIn integration: personal (posts as the signed-in member) and company
// (posts as an organization the member administers). Media uploads use the
// Assets API: register an upload, PUT the bytes, then reference the asset
// URN from a UGC post.

import { redirectUri } from "./config";

const API = "https://api.linkedin.com/v2";

const PERSONAL_SCOPES = "openid profile w_member_social";
const COMPANY_SCOPES =
  "openid profile w_member_social rw_organization_admin w_organization_social";

export function linkedinAuthUrl(
  state: string,
  accountScope: "personal" | "company",
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri("linkedin"),
    state,
    scope: accountScope === "company" ? COMPANY_SCOPES : PERSONAL_SCOPES,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export async function exchangeLinkedInCode(
  code: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      redirect_uri: redirectUri("linkedin"),
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`LinkedIn token exchange: ${body.error_description ?? res.status}`);
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 0 };
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** The signed-in member (for personal connections). */
export async function fetchLinkedInMember(
  token: string,
): Promise<{ id: string; name: string }> {
  const info = await apiGet<{ sub: string; name?: string }>("/userinfo", token);
  return { id: info.sub, name: info.name ?? "LinkedIn member" };
}

/** Organizations the member administers (for company connections). */
export async function fetchLinkedInOrganizations(
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  const res = await apiGet<{
    elements?: Array<{
      organization: string;
      "organization~"?: { id?: number; localizedName?: string };
    }>;
  }>(
    "/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organization~(id,localizedName)))",
    token,
  );
  return (res.elements ?? []).map((e) => ({
    // organization is "urn:li:organization:123"
    id: e.organization.split(":").pop() ?? e.organization,
    name: e["organization~"]?.localizedName ?? "LinkedIn organization",
  }));
}

/** Upload one media file and return its asset URN. */
async function uploadAsset(spec: {
  token: string;
  authorUrn: string;
  bytes: Uint8Array;
  recipe: "feedshare-image" | "feedshare-video";
}): Promise<string> {
  const register = await apiPost<{
    value: {
      asset: string;
      uploadMechanism: Record<
        string,
        { uploadUrl: string; headers?: Record<string, string> }
      >;
    };
  }>("/assets?action=registerUpload", spec.token, {
    registerUploadRequest: {
      recipes: [`urn:li:digitalmediaRecipe:${spec.recipe}`],
      owner: spec.authorUrn,
      serviceRelationships: [
        { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
      ],
    },
  });
  const mechanism = Object.values(register.value.uploadMechanism)[0];
  if (!mechanism?.uploadUrl) throw new Error("LinkedIn returned no upload URL");

  const upload = await fetch(mechanism.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${spec.token}`,
      ...(mechanism.headers ?? {}),
    },
    body: new Blob([spec.bytes as BlobPart]),
  });
  if (!upload.ok) {
    throw new Error(`LinkedIn media upload failed (${upload.status})`);
  }
  return register.value.asset;
}

/**
 * Publish a post as a member (`urn:li:person:...`) or organization
 * (`urn:li:organization:...`) with pre-downloaded media bytes.
 * Returns the public post URL.
 */
export async function publishLinkedInPost(spec: {
  token: string;
  authorUrn: string;
  caption: string;
  media: Array<{ bytes: Uint8Array; kind: "image" | "video" }>;
}): Promise<string> {
  const assets: Array<{ status: string; media: string }> = [];
  for (const m of spec.media) {
    const asset = await uploadAsset({
      token: spec.token,
      authorUrn: spec.authorUrn,
      bytes: m.bytes,
      recipe: m.kind === "video" ? "feedshare-video" : "feedshare-image",
    });
    assets.push({ status: "READY", media: asset });
  }

  const category =
    spec.media.length === 0
      ? "NONE"
      : spec.media[0].kind === "video"
        ? "VIDEO"
        : "IMAGE";
  const post = await apiPost<{ id?: string }>("/ugcPosts", spec.token, {
    author: spec.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: spec.caption },
        shareMediaCategory: category,
        media: assets,
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  });
  return post.id
    ? `https://www.linkedin.com/feed/update/${post.id}`
    : "https://www.linkedin.com/feed/";
}
