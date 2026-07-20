"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/** Delete a video clip asset: row first (authoritative), then the file. */
export async function deleteVideoAsset(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("video_assets")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!row) return;

  const { error } = await supabase.from("video_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("clips").remove([row.storage_path]);

  revalidatePath("/clips");
}

/** Rename a clip inline from the library. */
export async function updateVideoAsset(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("video_assets")
    .update({ title: title || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/clips");
}
