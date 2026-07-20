// MP4 rendering for the video editor. Text is overlaid at the render layer
// (Creatomate) per the build-spec constraint, and the render itself is the
// shared async submit → poll → fetch sub-flow in src/lib/creatomate.ts.
// The finished MP4 is persisted to the private `renders` bucket and recorded
// on the `videos` row, so it can be previewed and downloaded from the editor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { runCreatomateRender, slideElements, hasCreatomateKey } from "@/lib/creatomate";

export { hasCreatomateKey };

type Supabase = SupabaseClient<Database>;

interface ClipRow {
  id: string;
  position: number;
  headline: string | null;
  body_copy: string | null;
  duration_seconds: number;
  assets: { storage_path: string } | null;
  video_assets: { storage_path: string } | null;
}

export interface RenderVideoResult {
  ok: boolean;
  message: string;
}

/**
 * Render a video's clips + soundtrack into an MP4 via Creatomate and persist
 * it to the `renders` bucket at `{org_id}/videos/{video_id}.mp4`. Updates the
 * `videos` row's status through rendering → ready (or error, with the reason
 * in render_error so the editor can show it).
 *
 * Intentionally no "already rendering" guard: if a previous invocation died
 * mid-render (deploy, function timeout), the row would be stranded at
 * `rendering` forever and a guard would lock the user out. Re-running is safe
 * — the output path is deterministic and the last writer wins.
 */
export async function renderVideo(
  supabase: Supabase,
  orgId: string,
  videoId: string,
): Promise<RenderVideoResult> {
  if (!hasCreatomateKey()) {
    return {
      ok: false,
      message:
        "Rendering needs CREATOMATE_API_KEY configured — the in-app preview still works.",
    };
  }

  const { data: video } = await supabase
    .from("videos")
    .select("id, width, height, audio_asset_id, status")
    .eq("id", videoId)
    .single();
  if (!video) return { ok: false, message: "Video not found." };

  const { data: clipRows } = await supabase
    .from("video_clips")
    .select(
      "id, position, headline, body_copy, duration_seconds, assets(storage_path), video_assets(storage_path)",
    )
    .eq("video_id", videoId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const clips = ((clipRows ?? []) as unknown as ClipRow[]).filter(
    (c) => c.assets?.storage_path || c.video_assets?.storage_path,
  );
  if (clips.length === 0) {
    return { ok: false, message: "Add at least one clip with media first." };
  }

  await supabase
    .from("videos")
    .update({ status: "rendering", render_error: null })
    .eq("id", videoId);

  try {
    const outputPath = await submitAndPersist(supabase, orgId, videoId, {
      width: video.width,
      height: video.height,
      audioAssetId: video.audio_asset_id,
      clips,
    });
    await supabase
      .from("videos")
      .update({ status: "ready", output_path: outputPath })
      .eq("id", videoId);
    return { ok: true, message: "Video rendered — ready to download." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Render failed.";
    await supabase
      .from("videos")
      .update({ status: "error", render_error: message })
      .eq("id", videoId);
    return { ok: false, message };
  }
}

async function submitAndPersist(
  supabase: Supabase,
  orgId: string,
  videoId: string,
  spec: {
    width: number;
    height: number;
    audioAssetId: string | null;
    clips: ClipRow[];
  },
): Promise<string> {
  const totalSeconds = spec.clips.reduce(
    (sum, c) => sum + Number(c.duration_seconds),
    0,
  );

  // Sign clip media in one storage round trip per bucket (stills live in
  // `assets`, video clips in `clips`).
  const imagePaths = spec.clips
    .filter((c) => c.assets?.storage_path)
    .map((c) => c.assets!.storage_path);
  const videoPaths = spec.clips
    .filter((c) => !c.assets?.storage_path && c.video_assets?.storage_path)
    .map((c) => c.video_assets!.storage_path);
  const [imageSigned, videoSigned] = await Promise.all([
    imagePaths.length
      ? supabase.storage.from("assets").createSignedUrls(imagePaths, 3600)
      : Promise.resolve({ data: [], error: null }),
    videoPaths.length
      ? supabase.storage.from("clips").createSignedUrls(videoPaths, 3600)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (imageSigned.error || videoSigned.error) {
    throw new Error(
      `sign clip media: ${imageSigned.error?.message ?? videoSigned.error?.message}`,
    );
  }
  const urlByPath = new Map<string, string>();
  imagePaths.forEach((p, i) => {
    const url = imageSigned.data?.[i]?.signedUrl;
    if (url) urlByPath.set(p, url);
  });
  videoPaths.forEach((p, i) => {
    const url = videoSigned.data?.[i]?.signedUrl;
    if (url) urlByPath.set(p, url);
  });

  // One composition per clip on track 1 — same-track elements play in
  // sequence, and `transition: true` fades make each cut a crossfade. Inside
  // each composition the layout is the shared slide composition, so the MP4
  // matches the still-slide renderer and the in-app preview.
  const elements: Array<Record<string, unknown>> = spec.clips.map((clip) => {
    const isImage = Boolean(clip.assets?.storage_path);
    const path = isImage
      ? clip.assets!.storage_path
      : clip.video_assets!.storage_path;
    const url = urlByPath.get(path);
    if (!url) {
      throw new Error(`sign clip ${clip.position + 1} media: failed`);
    }
    return {
      type: "composition",
      track: 1,
      duration: Number(clip.duration_seconds),
      animations: [{ type: "fade", duration: 0.5, transition: true }],
      elements: slideElements({
        imageUrl: url,
        headline: clip.headline,
        bodyCopy: clip.body_copy,
        fontScale: spec.width / 1080,
        mediaType: isImage ? "image" : "video",
      }),
    };
  });

  // Soundtrack on its own track: looped if shorter than the video (matching
  // the in-app preview), trimmed to the video length, with a fade-out.
  if (spec.audioAssetId) {
    const { data: audioRow } = await supabase
      .from("audio_assets")
      .select("storage_path")
      .eq("id", spec.audioAssetId)
      .single();
    if (audioRow) {
      const { data: signedAudio } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioRow.storage_path, 3600);
      if (signedAudio) {
        elements.push({
          type: "audio",
          source: signedAudio.signedUrl,
          track: 2,
          time: 0,
          duration: totalSeconds,
          loop: true,
          audio_fade_out: 1.5,
        });
      }
    }
  }

  // Video renders take longer than stills — allow up to 4 minutes of polling
  // (the editor route's maxDuration budgets for this).
  const bytes = await runCreatomateRender(
    {
      output_format: "mp4",
      width: spec.width,
      height: spec.height,
      frame_rate: 30,
      elements,
    },
    240_000,
  );

  const outputPath = `${orgId}/videos/${videoId}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from("renders")
    .upload(outputPath, bytes, { contentType: "video/mp4", upsert: true });
  if (uploadError) {
    throw new Error(`render upload: ${uploadError.message}`);
  }
  return outputPath;
}
