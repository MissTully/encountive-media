"use client";

import { createClient } from "@/lib/supabase/client";
import { Uploader as SharedUploader, fileExt } from "@/components/uploader";

/** Reads a video's duration + dimensions in the browser (best effort). */
function readVideoMeta(
  file: File,
): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ duration: null, width: null, height: null });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

/** "product-demo_v2.mp4" → "product demo v2" — editable later. */
function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export function ClipUploader({ orgId }: { orgId: string }) {
  const supabase = createClient();

  async function upload(file: File): Promise<string | null> {
    // Path is prefixed with the org id so the storage RLS policy authorizes it.
    const path = `${orgId}/${crypto.randomUUID()}.${fileExt(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("clips")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return uploadError.message;

    const meta = await readVideoMeta(file);
    const { error: insertError } = await supabase.from("video_assets").insert({
      org_id: orgId,
      storage_path: path,
      title: titleFromFileName(file.name) || null,
      source: "uploaded",
      status: "ready",
      mime_type: file.type || null,
      duration_seconds: meta.duration,
      width: meta.width,
      height: meta.height,
    });
    if (insertError) {
      // Roll back the orphaned storage object so it doesn't linger.
      await supabase.storage.from("clips").remove([path]);
      return insertError.message;
    }
    return null;
  }

  return (
    <SharedUploader
      accept="video/*"
      chooseLabel="Choose video clips to upload"
      hint="Select multiple files — MP4, MOV, WebM"
      upload={upload}
    />
  );
}
