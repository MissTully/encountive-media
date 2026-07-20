// MP4 rendering for the video editor. Follows the build-spec constraints the
// carousel renderer already follows: text is overlaid at the render layer
// (Creatomate), and every render is the async submit → poll → fetch pattern.
// The finished MP4 is persisted to the private `renders` bucket and recorded
// on the `videos` row, so it can be previewed and downloaded from the editor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

export function hasCreatomateKey(): boolean {
  return Boolean(process.env.CREATOMATE_API_KEY);
}

interface ClipRow {
  id: string;
  position: number;
  headline: string | null;
  body_copy: string | null;
  duration_seconds: number;
  assets: { storage_path: string } | null;
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
  if (video.status === "rendering") {
    return { ok: false, message: "A render is already in progress." };
  }

  const { data: clipRows } = await supabase
    .from("video_clips")
    .select("id, position, headline, body_copy, duration_seconds, assets(storage_path)")
    .eq("video_id", videoId)
    .order("position", { ascending: true });
  const clips = ((clipRows ?? []) as ClipRow[]).filter(
    (c) => c.assets?.storage_path,
  );
  if (clips.length === 0) {
    return { ok: false, message: "Add at least one clip with an image first." };
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
  const apiKey = process.env.CREATOMATE_API_KEY!;
  const totalSeconds = spec.clips.reduce(
    (sum, c) => sum + Number(c.duration_seconds),
    0,
  );

  // Caption sizes are authored for the 1080-wide carousel format (72px
  // headline / 38px body) and scaled to the chosen canvas.
  const fontScale = spec.width / 1080;

  // One composition per clip on track 1 — same-track elements play in
  // sequence, and `transition: true` fades make each cut a crossfade. Inside
  // each composition the layout matches the carousel slide renderer exactly:
  // background photo, dark overlay for contrast, headline + body.
  const elements: Array<Record<string, unknown>> = [];
  for (const clip of spec.clips) {
    const { data: signed, error: signError } = await supabase.storage
      .from("assets")
      .createSignedUrl(clip.assets!.storage_path, 3600);
    if (signError || !signed) {
      throw new Error(
        `sign clip ${clip.position + 1} background: ${signError?.message ?? "failed"}`,
      );
    }

    const hasText = Boolean(clip.headline || clip.body_copy);
    const inner: Array<Record<string, unknown>> = [
      {
        type: "image",
        source: signed.signedUrl,
        x: "50%",
        y: "50%",
        width: "100%",
        height: "100%",
        fit: "cover",
        ...(hasText ? { color_overlay: "rgba(0,0,0,0.45)" } : {}),
      },
    ];
    if (clip.headline) {
      inner.push({
        type: "text",
        text: clip.headline,
        x: "50%",
        y: "42%",
        width: "84%",
        x_alignment: "50%",
        y_alignment: "100%",
        font_family: "Inter",
        font_weight: "700",
        font_size: `${Math.round(72 * fontScale)} px`,
        fill_color: "#ffffff",
      });
    }
    if (clip.body_copy) {
      inner.push({
        type: "text",
        text: clip.body_copy,
        x: "50%",
        y: "48%",
        width: "78%",
        x_alignment: "50%",
        y_alignment: "0%",
        font_family: "Inter",
        font_weight: "400",
        font_size: `${Math.round(38 * fontScale)} px`,
        fill_color: "#f4f4f5",
      });
    }

    elements.push({
      type: "composition",
      track: 1,
      duration: Number(clip.duration_seconds),
      animations: [{ type: "fade", duration: 0.5, transition: true }],
      elements: inner,
    });
  }

  // Soundtrack on its own track, trimmed to the video length with a fade-out.
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
          audio_fade_out: 1.5,
        });
      }
    }
  }

  const source = {
    output_format: "mp4",
    width: spec.width,
    height: spec.height,
    frame_rate: 30,
    elements,
  };

  // Submit.
  const submitRes = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source }),
  });
  if (!submitRes.ok) {
    throw new Error(
      `Creatomate submit failed (${submitRes.status}): ${(await submitRes.text()).slice(0, 300)}`,
    );
  }
  const renders = (await submitRes.json()) as Array<{
    id: string;
    status: string;
    url?: string;
  }>;
  let render = renders[0];
  if (!render) throw new Error("Creatomate returned no render job");

  // Poll until finished (~3s interval; video takes longer than a still, so
  // allow up to 4 minutes — the editor route sets maxDuration accordingly).
  const deadline = Date.now() + 240_000;
  while (render.status !== "succeeded") {
    if (render.status === "failed") throw new Error("Creatomate render failed");
    if (Date.now() > deadline) throw new Error("Creatomate render timed out");
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(
      `https://api.creatomate.com/v1/renders/${render.id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!pollRes.ok) {
      throw new Error(`Creatomate poll failed (${pollRes.status})`);
    }
    render = (await pollRes.json()) as typeof render;
  }
  if (!render.url) throw new Error("Creatomate finished without an output URL");

  // Fetch the finished MP4 and persist it in the private renders bucket.
  const fileRes = await fetch(render.url);
  if (!fileRes.ok) {
    throw new Error(`fetching render output failed (${fileRes.status})`);
  }
  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  const outputPath = `${orgId}/videos/${videoId}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from("renders")
    .upload(outputPath, bytes, { contentType: "video/mp4", upsert: true });
  if (uploadError) {
    throw new Error(`render upload: ${uploadError.message}`);
  }
  return outputPath;
}
