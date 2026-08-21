import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  getSupabaseEnv,
  probeSupabase,
  signMediaUpload,
  uploadBytesToMedia,
} from "@/lib/supabase.server";

export type SocialPlatform = "linkedin" | "instagram";

export type SocialAccount = {
  id: string;
  platform: SocialPlatform;
  accountName: string | null;
  connected: boolean;
};

export type PublishJob = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  platform: SocialPlatform;
  kind: string;
  caption: string | null;
  status: string;
  error: string | null;
  postedUrl: string | null;
  createdAt: string;
};

function uid() {
  return `job-${Math.random().toString(36).slice(2, 10)}`;
}

export const listSocialAccounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SocialAccount[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      platform: string;
      account_name: string | null;
    }>`select id, platform, account_name from social_accounts where user_id = ${context.userId}`;
    const found = new Set(rows.map((r) => r.platform));
    const out: SocialAccount[] = [];
    for (const p of ["linkedin", "instagram"] as const) {
      const row = rows.find((r) => r.platform === p);
      out.push({
        id: row?.id ?? p,
        platform: p,
        accountName: row?.account_name ?? null,
        connected: found.has(p),
      });
    }
    return out;
  });

export const oauthStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const supabase = await probeSupabase();
    const databaseUrl = process.env.DATABASE_URL || "";
    return {
      linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      instagram: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      supabase: supabase.ok,
      supabaseError: supabase.ok ? null : supabase.error,
      database: databaseUrl.includes("supabase.co")
        ? ("supabase" as const)
        : databaseUrl
          ? ("postgres" as const)
          : ("preview" as const),
    };
  });

export const createMediaUpload = createServerFn({ method: "POST" })
  .validator((input: { filename: string; contentType: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!getSupabaseEnv()) {
      return { ok: false as const, error: "Supabase is not configured on deploy yet." };
    }
    try {
      const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file.bin";
      const path = `${context.userId}/${Date.now()}-${safe}`;
      const signed = await signMediaUpload(path);
      const sql = await getSql();
      const id = `media-${Math.random().toString(36).slice(2, 10)}`;
      await sql`insert into media_objects (id, user_id, path, public_url, content_type)
        values (${id}, ${context.userId}, ${path}, ${signed.publicUrl}, ${data.contentType})`;
      return { ok: true as const, ...signed, path };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Upload sign failed" };
    }
  });

export const disconnectAccount = createServerFn({ method: "POST" })
  .validator((input: { platform: SocialPlatform }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from social_accounts where user_id = ${context.userId} and platform = ${data.platform}`;
    return { ok: true as const };
  });

export const listPublishJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PublishJob[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      campaign_id: string;
      campaign_title: string;
      platform: string;
      kind: string;
      caption: string | null;
      status: string;
      error: string | null;
      posted_url: string | null;
      created_at: string;
    }>`select id, campaign_id, campaign_title, platform, kind, caption, status, error, posted_url, created_at
       from publish_jobs where user_id = ${context.userId} order by created_at desc limit 40`;
    return rows.map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      campaignTitle: r.campaign_title,
      platform: r.platform as SocialPlatform,
      kind: r.kind,
      caption: r.caption,
      status: r.status,
      error: r.error,
      postedUrl: r.posted_url,
      createdAt: r.created_at,
    }));
  });

export const queuePublish = createServerFn({ method: "POST" })
  .validator(
    (input: {
      campaignId: string;
      campaignTitle: string;
      platform: SocialPlatform;
      kind: "carousel" | "video" | "image";
      caption: string;
      imageDataUrl?: string;
      imageUrl?: string;
      videoUrl?: string;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = uid();
    const accounts = await sql<{
      access_token: string;
      meta: string | null;
    }>`select access_token, meta from social_accounts
       where user_id = ${context.userId} and platform = ${data.platform} limit 1`;
    const account = accounts[0];

    if (!account) {
      await sql`insert into publish_jobs (id, user_id, campaign_id, campaign_title, platform, kind, caption, status, error)
        values (${id}, ${context.userId}, ${data.campaignId}, ${data.campaignTitle}, ${data.platform}, ${data.kind}, ${data.caption}, ${"needs-connection"}, ${"Connect this channel, then retry."})`;
      return { ok: false as const, jobId: id, error: "Connect this channel, then retry." };
    }

    await sql`insert into publish_jobs (id, user_id, campaign_id, campaign_title, platform, kind, caption, status)
      values (${id}, ${context.userId}, ${data.campaignId}, ${data.campaignTitle}, ${data.platform}, ${data.kind}, ${data.caption}, ${"posting"})`;

    try {
      let postedUrl: string | null = null;
      if (data.platform === "linkedin") {
        postedUrl = await postLinkedIn(account.access_token, account.meta, data);
      } else {
        postedUrl = await postInstagram(account.access_token, account.meta, data);
      }
      await sql`update publish_jobs set status = ${"posted"}, posted_url = ${postedUrl} where id = ${id} and user_id = ${context.userId}`;
      return { ok: true as const, jobId: id, postedUrl };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Publish failed";
      await sql`update publish_jobs set status = ${"failed"}, error = ${error} where id = ${id} and user_id = ${context.userId}`;
      return { ok: false as const, jobId: id, error };
    }
  });

async function postLinkedIn(
  token: string,
  metaJson: string | null,
  data: { caption: string; imageDataUrl?: string; imageUrl?: string; videoUrl?: string; kind: string },
): Promise<string> {
  let author = "";
  try {
    const meta = metaJson ? (JSON.parse(metaJson) as { personUrn?: string }) : {};
    author = meta.personUrn ?? "";
  } catch {
    author = "";
  }
  if (!author) {
    const me = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!me.ok) throw new Error(`LinkedIn profile ${me.status}`);
    const body = (await me.json()) as { sub?: string };
    if (!body.sub) throw new Error("LinkedIn did not return a member id");
    author = `urn:li:person:${body.sub}`;
  }

  const payload: Record<string, unknown> = {
    author,
    commentary: data.caption.slice(0, 3000),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (data.videoUrl && /^https?:/i.test(data.videoUrl)) {
    const urn = await uploadLinkedInVideo(token, author, data.videoUrl);
    payload.content = { media: { id: urn } };
  } else if (data.imageDataUrl?.startsWith("data:")) {
    const urn = await uploadLinkedInImage(token, author, data.imageDataUrl);
    payload.content = { media: { id: urn } };
  } else if (data.imageUrl && /^https?:/i.test(data.imageUrl)) {
    const dataUrl = await httpsToDataUrl(data.imageUrl);
    const urn = await uploadLinkedInImage(token, author, dataUrl);
    payload.content = { media: { id: urn } };
  }

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`LinkedIn ${res.status}: ${err.slice(0, 220)}`);
  }
  const postId = res.headers.get("x-restli-id") || "";
  return postId ? `https://www.linkedin.com/feed/update/${postId}` : "https://www.linkedin.com/feed/";
}

async function uploadLinkedInImage(token: string, owner: string, dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);/.exec(header)?.[1] || "image/jpeg";
  const bytes = Buffer.from(b64, "base64");

  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!init.ok) throw new Error(`LinkedIn upload init ${init.status}`);
  const body = (await init.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = body.value?.uploadUrl;
  const imageUrn = body.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error("LinkedIn did not return an upload URL");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
    body: bytes,
  });
  if (!put.ok) throw new Error(`LinkedIn image PUT ${put.status}`);
  return imageUrn;
}

async function uploadLinkedInVideo(token: string, owner: string, videoUrl: string): Promise<string> {
  const file = await fetch(videoUrl);
  if (!file.ok) throw new Error(`Could not fetch video for LinkedIn (${file.status})`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const init = await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner,
        fileSizeBytes: bytes.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });
  if (!init.ok) {
    const err = await init.text().catch(() => "");
    throw new Error(`LinkedIn video init ${init.status}: ${err.slice(0, 180)}`);
  }
  const body = (await init.json()) as {
    value?: {
      video?: string;
      uploadToken?: string;
      uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[];
    };
  };
  const videoUrn = body.value?.video;
  const instructions = body.value?.uploadInstructions ?? [];
  if (!videoUrn || instructions.length === 0) throw new Error("LinkedIn did not return a video upload URL");

  for (const part of instructions) {
    const slice = bytes.subarray(part.firstByte, part.lastByte + 1);
    const put = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: slice,
    });
    if (!put.ok) throw new Error(`LinkedIn video PUT ${put.status}`);
  }

  if (body.value?.uploadToken) {
    const fin = await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202401",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: body.value.uploadToken,
        },
      }),
    });
    if (!fin.ok && fin.status !== 204) {
      const err = await fin.text().catch(() => "");
      throw new Error(`LinkedIn video finalize ${fin.status}: ${err.slice(0, 160)}`);
    }
  }
  return videoUrn;
}

async function postInstagram(
  token: string,
  metaJson: string | null,
  data: { caption: string; imageDataUrl?: string; imageUrl?: string; videoUrl?: string },
): Promise<string> {
  let igUserId = "";
  try {
    const meta = metaJson ? (JSON.parse(metaJson) as { igUserId?: string }) : {};
    igUserId = meta.igUserId ?? "";
  } catch {
    igUserId = "";
  }
  if (!igUserId) throw new Error("Instagram account id missing. Reconnect the channel.");

  let imageUrl = data.imageUrl && /^https?:/i.test(data.imageUrl) ? data.imageUrl : "";
  if (!imageUrl && data.imageDataUrl?.startsWith("data:")) {
    imageUrl = await dataUrlToPublic(data.imageDataUrl, "cover.jpg");
  }
  const videoUrl = data.videoUrl && /^https?:/i.test(data.videoUrl) ? data.videoUrl : "";

  if (videoUrl) {
    return publishInstagramMedia(igUserId, token, {
      media_type: "REELS",
      video_url: videoUrl,
      caption: data.caption,
      share_to_feed: "true",
    });
  }
  if (!imageUrl) {
    throw new Error(
      "Instagram needs a public image or video URL. Connect Supabase storage, then retry.",
    );
  }
  return publishInstagramMedia(igUserId, token, {
    image_url: imageUrl,
    caption: data.caption,
  });
}

async function publishInstagramMedia(
  igUserId: string,
  token: string,
  fields: Record<string, string>,
): Promise<string> {
  const create = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, access_token: token }),
  });
  if (!create.ok) {
    const err = await create.text().catch(() => "");
    throw new Error(`Instagram media ${create.status}: ${err.slice(0, 180)}`);
  }
  const created = (await create.json()) as { id?: string };
  if (!created.id) throw new Error("Instagram did not return a container id");

  if (fields.video_url) {
    await waitForIgContainer(igUserId, created.id, token);
  }

  const publish = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: token }),
  });
  if (!publish.ok) {
    const err = await publish.text().catch(() => "");
    throw new Error(`Instagram publish ${publish.status}: ${err.slice(0, 180)}`);
  }
  const posted = (await publish.json()) as { id?: string };
  return posted.id ? `https://www.instagram.com/reel/${posted.id}/` : "https://www.instagram.com/";
}

async function waitForIgContainer(igUserId: string, creationId: string, token: string) {
  for (let i = 0; i < 20; i += 1) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    );
    if (res.ok) {
      const body = (await res.json()) as { status_code?: string; status?: string };
      if (body.status_code === "FINISHED" || body.status === "FINISHED") return;
      if (body.status_code === "ERROR" || body.status === "ERROR") {
        throw new Error("Instagram failed to process the video. Mix as MP4 if you can, then retry.");
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  void igUserId;
}

async function httpsToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch image");
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function dataUrlToPublic(dataUrl: string, filename: string): Promise<string> {
  if (!getSupabaseEnv()) {
    throw new Error("Connect Supabase storage to host this still for Instagram.");
  }
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);/.exec(header)?.[1] || "image/jpeg";
  const bytes = Buffer.from(b64, "base64");
  const path = `publish/${Date.now()}-${filename}`;
  return uploadBytesToMedia(path, bytes, mime);
}
