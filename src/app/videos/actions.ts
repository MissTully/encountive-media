"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { renderVideo } from "@/lib/video";
import { publishVideoToAccounts } from "@/lib/social/publish";

// Server actions are reachable via direct POST, not just the UI — every one
// verifies the session first (RLS is the second line of defense, but it fails
// silently: an unauthorized update matches zero rows and reports success).
async function requireProfile() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");
  return ctx;
}

// Output formats the editor offers. Keys are stored nowhere — width/height
// land on the videos row — so adding a format here is enough.
const FORMATS: Record<string, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

/** Create a video and open it in the editor. */
export async function createVideo(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Untitled video";
  const format = FORMATS[String(formData.get("format") ?? "")] ?? FORMATS.portrait;

  const ctx = await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .insert({
      org_id: ctx.profile.org_id,
      title,
      width: format.width,
      height: format.height,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/videos");
  redirect(`/videos/${data.id}`);
}

/** Delete a video (clips cascade) and its rendered MP4 if one exists. */
export async function deleteVideo(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await requireProfile();

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("videos")
    .select("output_path")
    .eq("id", id)
    .single();
  if (!row) return;

  // Delete the row first — it's the authoritative record. A failed storage
  // cleanup leaves only an orphaned object, never a dangling reference.
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (row.output_path) {
    await supabase.storage.from("renders").remove([row.output_path]);
  }

  revalidatePath("/videos");
}

/** Update title / soundtrack from the editor header. */
export async function updateVideoSettings(videoId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const audioAssetId = String(formData.get("audio_asset_id") ?? "").trim();

  await requireProfile();

  const supabase = await createClient();
  const { error } = await supabase
    .from("videos")
    .update({
      ...(title ? { title } : {}),
      audio_asset_id: audioAssetId || null,
    })
    .eq("id", videoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/videos/${videoId}`);
}

/** Append selected library images to the timeline, one clip each. */
export async function addClipsToVideo(videoId: string, assetIds: string[]) {
  if (assetIds.length === 0) return;

  await requireProfile();

  const supabase = await createClient();
  const { count } = await supabase
    .from("video_clips")
    .select("*", { count: "exact", head: true })
    .eq("video_id", videoId);
  const base = count ?? 0;

  const rows = assetIds.map((asset_id, i) => ({
    video_id: videoId,
    asset_id,
    position: base + i,
  }));
  const { error } = await supabase.from("video_clips").insert(rows);
  if (error) throw new Error(error.message);

  revalidatePath(`/videos/${videoId}`);
}

/** Update one clip's captions and hold duration. */
export async function updateClip(
  videoId: string,
  clipId: string,
  formData: FormData,
) {
  const headline = String(formData.get("headline") ?? "").trim();
  const bodyCopy = String(formData.get("body_copy") ?? "").trim();
  const duration = Number(formData.get("duration_seconds"));
  const durationSeconds =
    Number.isFinite(duration) && duration >= 1 && duration <= 15 ? duration : 3;

  await requireProfile();

  const supabase = await createClient();
  const { error } = await supabase
    .from("video_clips")
    .update({
      headline: headline || null,
      body_copy: bodyCopy || null,
      duration_seconds: durationSeconds,
    })
    .eq("id", clipId)
    .eq("video_id", videoId);
  if (error) throw new Error(error.message);

  revalidatePath(`/videos/${videoId}`);
}

/** Remove a clip and close the position gap it leaves. */
export async function removeClip(videoId: string, clipId: string) {
  await requireProfile();

  const supabase = await createClient();
  const { error } = await supabase
    .from("video_clips")
    .delete()
    .eq("id", clipId)
    .eq("video_id", videoId);
  if (error) throw new Error(error.message);

  // Compact positions to 0..n-1 so ordering stays gap-free and deterministic.
  const { data: clips } = await supabase
    .from("video_clips")
    .select("id, position")
    .eq("video_id", videoId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (clips) {
    const results = await Promise.all(
      clips
        .map((c, i) => ({ id: c.id, from: c.position, to: i }))
        .filter((m) => m.from !== m.to)
        .map((m) =>
          supabase.from("video_clips").update({ position: m.to }).eq("id", m.id),
        ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  revalidatePath(`/videos/${videoId}`);
}

/** Move a clip one step earlier or later in the sequence. */
export async function moveClip(
  videoId: string,
  clipId: string,
  direction: "up" | "down",
) {
  await requireProfile();

  const supabase = await createClient();
  const { data: clips } = await supabase
    .from("video_clips")
    .select("id, position")
    .eq("video_id", videoId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!clips) return;

  const index = clips.findIndex((c) => c.id === clipId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= clips.length) return;

  // Sequential, checked writes: if the first update fails we stop before
  // touching the second row, so a partial swap can't corrupt the ordering.
  const first = await supabase
    .from("video_clips")
    .update({ position: clips[swapWith].position })
    .eq("id", clips[index].id);
  if (first.error) throw new Error(first.error.message);
  const second = await supabase
    .from("video_clips")
    .update({ position: clips[index].position })
    .eq("id", clips[swapWith].id);
  if (second.error) throw new Error(second.error.message);

  revalidatePath(`/videos/${videoId}`);
}

/**
 * Turn an approved/reviewed carousel into a video draft: one clip per slide
 * (same image, headline, and body copy), carrying over the carousel's
 * soundtrack. Opens the editor so pacing and captions can be adjusted.
 * Expected problems (no carousel/slides yet) return to the request page as a
 * notice instead of throwing into the generic error screen.
 */
export async function createVideoFromCarousel(
  requestId: string,
  projectId: string,
  formData: FormData,
) {
  const ctx = await requireProfile();
  const backWithNotice = (message: string) =>
    redirect(
      `/projects/${projectId}/requests/${requestId}?notice=${encodeURIComponent(message)}`,
    );

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("content_requests")
    .select("topic")
    .eq("id", requestId)
    .single();
  const { data: carousel } = await supabase
    .from("carousels")
    .select("id, audio_asset_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!carousel) return backWithNotice("No carousel to turn into a video yet.");

  const { data: slides } = await supabase
    .from("slides")
    .select("position, headline, body_copy, asset_id")
    .eq("carousel_id", carousel.id)
    .order("position", { ascending: true });
  if (!slides || slides.length === 0) {
    return backWithNotice("The carousel has no slides yet.");
  }

  // Aspect-ratio preset chosen on the review page (platform-defaulted there);
  // falls back to 4:5 portrait for direct POSTs without a format.
  const format = FORMATS[String(formData.get("format") ?? "")] ?? FORMATS.portrait;

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      org_id: ctx.profile.org_id,
      project_id: projectId,
      title: request?.topic ? `${request.topic} — video` : "Carousel video",
      audio_asset_id: carousel.audio_asset_id,
      width: format.width,
      height: format.height,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: clipsError } = await supabase.from("video_clips").insert(
    slides.map((s, i) => ({
      video_id: video.id,
      position: i,
      asset_id: s.asset_id,
      headline: s.headline,
      body_copy: s.body_copy,
      duration_seconds: 4,
    })),
  );
  if (clipsError) throw new Error(clipsError.message);

  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}

/**
 * Publish a rendered video to the selected connected social accounts.
 * Runs in-request (platform uploads + processing polls); the publish page
 * sets maxDuration to budget for it. Outcomes land in `social_posts` and are
 * summarized back onto the page as a notice.
 */
export async function publishVideo(videoId: string, formData: FormData) {
  const ctx = await requireProfile();

  const accountIds = formData
    .getAll("account_id")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const caption = String(formData.get("caption") ?? "").trim();

  const supabase = await createClient();
  const outcomes = await publishVideoToAccounts(
    supabase,
    ctx.profile.org_id,
    videoId,
    accountIds,
    caption,
  );

  const summary = outcomes
    .map((o) =>
      o.ok
        ? `Published to ${o.accountName}.`
        : `${o.accountName ? `${o.accountName}: ` : ""}${o.message}`,
    )
    .join(" ");

  revalidatePath(`/videos/${videoId}/publish`);
  redirect(`/videos/${videoId}/publish?notice=${encodeURIComponent(summary)}`);
}

/**
 * Render the video to MP4 via Creatomate (submit → poll → fetch → persist).
 * Runs in-request like carousel generation; the editor page sets maxDuration.
 */
export async function renderVideoNow(videoId: string) {
  const ctx = await requireProfile();

  const supabase = await createClient();
  const result = await renderVideo(supabase, ctx.profile.org_id, videoId);

  revalidatePath(`/videos/${videoId}`);
  redirect(`/videos/${videoId}?notice=${encodeURIComponent(result.message)}`);
}
