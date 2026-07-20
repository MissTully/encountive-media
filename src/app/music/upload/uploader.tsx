"use client";

import { createClient } from "@/lib/supabase/client";
import { Uploader as SharedUploader, fileExt } from "@/components/uploader";

/** Reads a track's duration in the browser (best effort). */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  });
}

/** "my-track_v2.mp3" → "my track v2" — a sensible default, editable later. */
function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export function MusicUploader({ orgId }: { orgId: string }) {
  const supabase = createClient();

  async function upload(file: File): Promise<string | null> {
    // Path is prefixed with the org id so the storage RLS policy authorizes it.
    const path = `${orgId}/${crypto.randomUUID()}.${fileExt(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return uploadError.message;

    const duration = await readDuration(file);
    const { error: insertError } = await supabase.from("audio_assets").insert({
      org_id: orgId,
      storage_path: path,
      title: titleFromFileName(file.name) || null,
      source: "uploaded",
      status: "ready",
      mime_type: file.type || null,
      duration_seconds: duration,
    });
    if (insertError) {
      // Roll back the orphaned storage object so it doesn't linger.
      await supabase.storage.from("audio").remove([path]);
      return insertError.message;
    }
    return null;
  }

  return (
    <SharedUploader
      accept="audio/*"
      chooseLabel="Choose music to upload"
      hint="Select multiple files — MP3, WAV, M4A, OGG"
      upload={upload}
    />
  );
}
