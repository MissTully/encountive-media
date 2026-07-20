"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  publishFacebookImages,
  publishFacebookVideo,
  publishInstagramImages,
  publishInstagramVideo,
} from "@/lib/social/meta";
import { publishLinkedInPost } from "@/lib/social/linkedin";

interface ConnectionRow {
  id: string;
  provider: string;
  account_scope: string;
  display_name: string;
  external_id: string;
  access_token: string;
}

/** Remove a connected account (posting history rows keep their record). */
export async function disconnectSocial(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/social");
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloading media failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Publish media to one connection. Facebook/Instagram ingest by URL; LinkedIn
 * needs the bytes uploaded. Returns the public post URL.
 */
async function publishToConnection(spec: {
  connection: ConnectionRow;
  caption: string;
  kind: "video" | "images";
  urls: string[]; // signed, media-CDN, or public URLs
}): Promise<string> {
  const { connection, caption, kind, urls } = spec;
  if (connection.provider === "facebook") {
    return kind === "video"
      ? publishFacebookVideo({
          pageId: connection.external_id,
          pageToken: connection.access_token,
          caption,
          videoUrl: urls[0],
        })
      : publishFacebookImages({
          pageId: connection.external_id,
          pageToken: connection.access_token,
          caption,
          imageUrls: urls,
        });
  }
  if (connection.provider === "instagram") {
    return kind === "video"
      ? publishInstagramVideo({
          igUserId: connection.external_id,
          pageToken: connection.access_token,
          caption,
          videoUrl: urls[0],
        })
      : publishInstagramImages({
          igUserId: connection.external_id,
          pageToken: connection.access_token,
          caption,
          imageUrls: urls,
        });
  }
  if (connection.provider === "linkedin") {
    const authorUrn =
      connection.account_scope === "company"
        ? `urn:li:organization:${connection.external_id}`
        : `urn:li:person:${connection.external_id}`;
    const media = [];
    for (const url of urls) {
      media.push({
        bytes: await fetchBytes(url),
        kind: kind === "video" ? ("video" as const) : ("image" as const),
      });
    }
    return publishLinkedInPost({
      token: connection.access_token,
      authorUrn,
      caption,
      media,
    });
  }
  throw new Error(`Unknown provider ${connection.provider}`);
}

/** Shared core: run a publish across the selected connections + log rows. */
async function publishToSelected(spec: {
  orgId: string;
  connectionIds: string[];
  caption: string;
  kind: "video" | "images";
  urls: string[];
  ref: { video_id?: string; request_id?: string };
}): Promise<string> {
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("social_connections")
    .select("id, provider, account_scope, display_name, external_id, access_token")
    .in("id", spec.connectionIds);

  const results: string[] = [];
  for (const connection of (connections ?? []) as ConnectionRow[]) {
    // Record the attempt first so a crash mid-publish still leaves a trace.
    const { data: postRow } = await supabase
      .from("social_posts")
      .insert({
        org_id: spec.orgId,
        connection_id: connection.id,
        caption: spec.caption,
        status: "posting",
        ...spec.ref,
      })
      .select("id")
      .single();

    try {
      const url = await publishToConnection({
        connection,
        caption: spec.caption,
        kind: spec.kind,
        urls: spec.urls,
      });
      if (postRow) {
        await supabase
          .from("social_posts")
          .update({
            status: "posted",
            external_url: url,
            posted_at: new Date().toISOString(),
          })
          .eq("id", postRow.id);
      }
      results.push(`✓ ${connection.display_name}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "failed";
      if (postRow) {
        await supabase
          .from("social_posts")
          .update({ status: "failed", error: message })
          .eq("id", postRow.id);
      }
      results.push(`✗ ${connection.display_name}: ${message}`);
    }
  }
  return results.join(" · ");
}

/** Share a rendered video to the selected connected accounts. */
export async function publishVideoToSocial(videoId: string, formData: FormData) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const caption = String(formData.get("caption") ?? "").trim();
  const connectionIds = formData.getAll("connections").map(String).filter(Boolean);
  const backUrl = `/videos/${videoId}`;
  if (connectionIds.length === 0) {
    redirect(`${backUrl}?notice=${encodeURIComponent("Pick at least one account to post to.")}`);
  }

  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("output_path, status")
    .eq("id", videoId)
    .single();
  if (!video?.output_path || video.status !== "ready") {
    redirect(`${backUrl}?notice=${encodeURIComponent("Render the MP4 first, then share it.")}`);
  }

  // Long-lived signed URL: Instagram/Facebook fetch it server-side and video
  // processing can take a while.
  const { data: signed } = await supabase.storage
    .from("renders")
    .createSignedUrl(video.output_path, 21600);
  if (!signed) {
    redirect(`${backUrl}?notice=${encodeURIComponent("Could not sign the video URL.")}`);
  }

  const summary = await publishToSelected({
    orgId: ctx.profile.org_id,
    connectionIds,
    caption,
    kind: "video",
    urls: [signed.signedUrl],
    ref: { video_id: videoId },
  });

  revalidatePath(backUrl);
  redirect(`${backUrl}?notice=${encodeURIComponent(summary)}`);
}

/** Share an approved carousel's finished slides to the selected accounts. */
export async function publishCarouselToSocial(
  requestId: string,
  projectId: string,
  formData: FormData,
) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const caption = String(formData.get("caption") ?? "").trim();
  const connectionIds = formData.getAll("connections").map(String).filter(Boolean);
  const backUrl = `/projects/${projectId}/requests/${requestId}`;
  if (connectionIds.length === 0) {
    redirect(`${backUrl}?notice=${encodeURIComponent("Pick at least one account to post to.")}`);
  }

  const supabase = await createClient();
  const { data: carousel } = await supabase
    .from("carousels")
    .select("id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!carousel) {
    redirect(`${backUrl}?notice=${encodeURIComponent("No carousel to share yet.")}`);
  }

  const { data: slides } = await supabase
    .from("slides")
    .select("position, render_path")
    .eq("carousel_id", carousel.id)
    .order("position", { ascending: true });
  const renderPaths = (slides ?? [])
    .map((s) => s.render_path)
    .filter((p): p is string => Boolean(p));
  if (renderPaths.length === 0) {
    redirect(
      `${backUrl}?notice=${encodeURIComponent(
        "The slides haven't been rendered yet — render the carousel first (Creatomate), then share.",
      )}`,
    );
  }

  // Hosted CDN URLs pass through; storage paths get long-lived signed URLs.
  const storagePaths = renderPaths.filter((p) => !p.startsWith("http"));
  const { data: signedBatch } = storagePaths.length
    ? await supabase.storage.from("renders").createSignedUrls(storagePaths, 21600)
    : { data: [] };
  const signedByPath = new Map<string, string>();
  storagePaths.forEach((p, i) => {
    const url = signedBatch?.[i]?.signedUrl;
    if (url) signedByPath.set(p, url);
  });
  const urls = renderPaths
    .map((p) => (p.startsWith("http") ? p : signedByPath.get(p)))
    .filter((u): u is string => Boolean(u));

  const summary = await publishToSelected({
    orgId: ctx.profile.org_id,
    connectionIds,
    caption,
    kind: "images",
    urls,
    ref: { request_id: requestId },
  });

  revalidatePath(backUrl);
  redirect(`${backUrl}?notice=${encodeURIComponent(summary)}`);
}
