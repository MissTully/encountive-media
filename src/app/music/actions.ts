"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/** Delete a track: remove the storage object first, then the row. */
export async function deleteAudioAsset(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("audio_assets")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!row) return;

  // Delete the row first — it's the authoritative record. A failed storage
  // cleanup leaves only an orphaned object; the reverse order could leave a
  // listed track whose file is gone (broken players and renders).
  const { error } = await supabase.from("audio_assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("audio").remove([row.storage_path]);

  revalidatePath("/music");
}

/** Rename a track (title + artist) inline from the library. */
export async function updateAudioAsset(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();
  const artist = String(formData.get("artist") ?? "").trim();

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("audio_assets")
    .update({ title: title || null, artist: artist || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/music");
}
