"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { publishVideoTo } from "@/lib/publish";
import type { SocialPlatform } from "@/types";

/**
 * Publish a rendered video to one connected social account — the video
 * counterpart of the carousel's publishRequest. Instagram posts it as a
 * Reel, Facebook as a Page video, LinkedIn as a video post. Every attempt
 * is recorded as a `publications` row (video_id set instead of request_id)
 * so the editor shows a publish log; failures keep their error and can be
 * retried with another press.
 */
export async function publishVideo(videoId: string, formData: FormData) {
  const accountId = String(formData.get("social_account_id") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  if (!accountId) return;

  // Server actions are reachable via direct POST — verify the session before
  // writing (RLS alone fails silently on zero matched rows).
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const back = `/videos/${videoId}`;
  const fail = (message: string) =>
    redirect(`${back}?notice=${encodeURIComponent(message)}`);

  const { data: video } = await supabase
    .from("videos")
    .select("id, status, output_path")
    .eq("id", videoId)
    .single();
  if (!video?.output_path || video.status !== "ready") {
    return fail("Render the MP4 first — the finished file is what gets published.");
  }

  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, platform, display_name, external_id, access_token")
    .eq("id", accountId)
    .single();
  if (!account) return fail("That account is no longer connected.");

  // Platforms fetch (or we re-upload) the MP4 over plain HTTPS; sign a URL
  // long enough to outlive Instagram's server-side video processing.
  const { data: signed } = await supabase.storage
    .from("renders")
    .createSignedUrl(video.output_path, 21600);
  if (!signed?.signedUrl) return fail("Could not sign the video URL.");

  const { data: publication, error: insertError } = await supabase
    .from("publications")
    .insert({
      video_id: videoId,
      social_account_id: account.id,
      caption,
      status: "publishing",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  let notice: string;
  try {
    const result = await publishVideoTo(account.platform as SocialPlatform, {
      videoUrl: signed.signedUrl,
      caption,
      accountRef: account.external_id,
      accessToken: account.access_token,
    });
    await supabase
      .from("publications")
      .update({
        status: "published",
        post_ref: result.postRef,
        post_url: result.postUrl,
        published_at: new Date().toISOString(),
      })
      .eq("id", publication.id);
    notice = `Published to ${account.display_name}.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("publications")
      .update({ status: "failed", error: message.slice(0, 1000) })
      .eq("id", publication.id);
    notice = `Publishing to ${account.display_name} failed — see the publish log.`;
  }

  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent(notice)}`);
}
