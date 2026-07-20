"use client";

import { createClient } from "@/lib/supabase/client";
import { Uploader as SharedUploader, fileExt } from "@/components/uploader";

/** Reads an image's pixel dimensions in the browser (best effort). */
function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function Uploader({ orgId }: { orgId: string }) {
  const supabase = createClient();

  async function upload(file: File): Promise<string | null> {
    // Path is prefixed with the org id so the storage RLS policy authorizes it.
    const path = `${orgId}/${crypto.randomUUID()}.${fileExt(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return uploadError.message;

    const dims = await readDimensions(file);
    const { error: insertError } = await supabase.from("assets").insert({
      org_id: orgId,
      storage_path: path,
      source: "uploaded",
      status: "uploaded",
      mime_type: file.type || null,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    });
    if (insertError) {
      // Roll back the orphaned storage object so it doesn't linger.
      await supabase.storage.from("assets").remove([path]);
      return insertError.message;
    }
    return null;
  }

  return (
    <SharedUploader
      accept="image/*"
      chooseLabel="Choose images to upload"
      hint="Select multiple files — JPG, PNG, WebP, GIF"
      upload={upload}
    />
  );
}
