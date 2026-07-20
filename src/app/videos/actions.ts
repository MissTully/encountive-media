"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { renderVideo } from "@/lib/video";

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

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

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

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("videos")
    .select("output_path")
    .eq("id", id)
    .single();
  if (row?.output_path) {
    await supabase.storage.from("renders").remove([row.output_path]);
  }
  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/videos");
}

/** Update title / soundtrack from the editor header. */
export async function updateVideoSettings(videoId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const audioAssetId = String(formData.get("audio_asset_id") ?? "").trim();

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
  const supabase = await createClient();
  const { error } = await supabase
    .from("video_clips")
    .delete()
    .eq("id", clipId)
    .eq("video_id", videoId);
  if (error) throw new Error(error.message);

  await renumberClips(videoId);
  revalidatePath(`/videos/${videoId}`);
}

/** Move a clip one step earlier or later in the sequence. */
export async function moveClip(
  videoId: string,
  clipId: string,
  direction: "up" | "down",
) {
  const supabase = await createClient();
  const { data: clips } = await supabase
    .from("video_clips")
    .select("id, position")
    .eq("video_id", videoId)
    .order("position", { ascending: true });
  if (!clips) return;

  const index = clips.findIndex((c) => c.id === clipId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= clips.length) return;

  await Promise.all([
    supabase
      .from("video_clips")
      .update({ position: clips[swapWith].position })
      .eq("id", clips[index].id),
    supabase
      .from("video_clips")
      .update({ position: clips[index].position })
      .eq("id", clips[swapWith].id),
  ]);

  revalidatePath(`/videos/${videoId}`);
}

/** Compact clip positions to 0..n-1 after a removal. */
async function renumberClips(videoId: string) {
  const supabase = await createClient();
  const { data: clips } = await supabase
    .from("video_clips")
    .select("id, position")
    .eq("video_id", videoId)
    .order("position", { ascending: true });
  if (!clips) return;
  await Promise.all(
    clips
      .filter((c, i) => c.position !== i)
      .map((c) =>
        supabase
          .from("video_clips")
          .update({ position: clips.indexOf(c) })
          .eq("id", c.id),
      ),
  );
}

/**
 * Turn an approved/reviewed carousel into a video draft: one clip per slide
 * (same image, headline, and body copy), carrying over the carousel's
 * soundtrack. Opens the editor so pacing and captions can be adjusted.
 */
export async function createVideoFromCarousel(
  requestId: string,
  projectId: string,
) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

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
  if (!carousel) throw new Error("No carousel to turn into a video yet.");

  const { data: slides } = await supabase
    .from("slides")
    .select("position, headline, body_copy, asset_id")
    .eq("carousel_id", carousel.id)
    .order("position", { ascending: true });
  if (!slides || slides.length === 0) {
    throw new Error("The carousel has no slides yet.");
  }

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      org_id: ctx.profile.org_id,
      project_id: projectId,
      title: request?.topic ? `${request.topic} — video` : "Carousel video",
      audio_asset_id: carousel.audio_asset_id,
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
 * Render the video to MP4 via Creatomate (submit → poll → fetch → persist).
 * Runs in-request like carousel generation; the editor page sets maxDuration.
 */
export async function renderVideoNow(videoId: string) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const result = await renderVideo(supabase, ctx.profile.org_id, videoId);

  revalidatePath(`/videos/${videoId}`);
  redirect(`/videos/${videoId}?notice=${encodeURIComponent(result.message)}`);
}
