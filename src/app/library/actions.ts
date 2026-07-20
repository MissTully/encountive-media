"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { analyzeImage } from "@/lib/gemini";
import { embedText } from "@/lib/embeddings";

/**
 * In-app version of n8n Workflow A (analyze → title → embed). It exists so the
 * library keeps working when n8n or its credentials are down — exactly what
 * stranded 240+ images at `uploaded`/`analyzing` on 2026-07-19.
 *
 * Processes a small batch per click (serverless time limits) and, unlike the
 * n8n flow, reverts an asset to `uploaded` when analysis fails so nothing is
 * ever stranded at `analyzing`.
 */
const BATCH_SIZE = 6;

export async function analyzePendingAssets() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: pending, error: fetchError } = await supabase
    .from("assets")
    .select("id, storage_path, mime_type")
    .eq("org_id", ctx.profile.org_id)
    .eq("status", "uploaded")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (fetchError) {
    redirect(`/library?notice=${encodeURIComponent(`Could not load pending images: ${fetchError.message}`)}`);
  }
  if (!pending || pending.length === 0) {
    redirect(`/library?notice=${encodeURIComponent("No pending images to analyze.")}`);
  }

  let done = 0;
  let firstError: string | null = null;

  for (const asset of pending) {
    // Claim it so a concurrent run (this button or n8n) skips it.
    const { data: claimed } = await supabase
      .from("assets")
      .update({ status: "analyzing" })
      .eq("id", asset.id)
      .eq("status", "uploaded")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("assets")
        .download(asset.storage_path);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "download failed");
      }

      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const analysis = await analyzeImage(
        base64,
        asset.mime_type ?? blob.type ?? "image/png",
      );
      const embedding = await embedText(analysis.description);

      const { error: updateError } = await supabase
        .from("assets")
        .update({
          title: analysis.title,
          description: analysis.description,
          tags: analysis.tags,
          embedding: JSON.stringify(embedding),
          status: "ready",
        })
        .eq("id", asset.id);
      if (updateError) throw new Error(updateError.message);
      done++;
    } catch (e) {
      // Put it back in the queue instead of stranding it at `analyzing`.
      await supabase
        .from("assets")
        .update({ status: "uploaded" })
        .eq("id", asset.id);
      firstError = firstError ?? (e instanceof Error ? e.message : String(e));
      // A failing API key/quota will fail every asset the same way — stop early.
      break;
    }
  }

  revalidatePath("/library");
  const message = firstError
    ? `Analyzed ${done} image${done === 1 ? "" : "s"}, then stopped: ${firstError}`
    : `Analyzed ${done} image${done === 1 ? "" : "s"}. Click again to continue with the next batch.`;
  redirect(`/library?notice=${encodeURIComponent(message)}`);
}

/** Rename a library image (the auto-generated title is editable per spec). */
export async function renameAsset(assetId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ title })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  revalidatePath("/library");
}

/**
 * Delete a library image everywhere it's referenced: off project boards, out
 * of slides/clips that used it as a background (nulled, not deleted — the
 * rendered output survives), then the row, then the storage object. References
 * are cleared in code first so the delete works regardless of how the FKs'
 * on-delete behavior is configured; the row goes before storage so a failed
 * cleanup leaves only an orphaned object, never a dangling reference.
 */
export async function deleteAsset(assetId: string) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("assets")
    .select("storage_path")
    .eq("id", assetId)
    .single();
  if (!asset) return;

  const cleared = await Promise.all([
    supabase.from("project_assets").delete().eq("asset_id", assetId),
    supabase.from("slides").update({ asset_id: null }).eq("asset_id", assetId),
    supabase
      .from("video_clips")
      .update({ asset_id: null })
      .eq("asset_id", assetId),
  ]);
  const clearError = cleared.find((r) => r.error)?.error;
  if (clearError) throw new Error(clearError.message);

  const { error } = await supabase.from("assets").delete().eq("id", assetId);
  if (error) throw new Error(error.message);
  await supabase.storage.from("assets").remove([asset.storage_path]);

  revalidatePath("/library");
}

/**
 * Recovery for assets stranded at `analyzing` by a crashed workflow run (the
 * n8n flow marks an asset `analyzing`, then dies on the Gemini call and never
 * reverts it). Flips them back to `uploaded` so either pipeline retries them.
 */
export async function resetStuckAssets() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ status: "uploaded" })
    .eq("org_id", ctx.profile.org_id)
    .eq("status", "analyzing")
    .select("id");

  revalidatePath("/library");
  const message = error
    ? `Could not reset stuck images: ${error.message}`
    : `Reset ${data?.length ?? 0} stuck image${(data?.length ?? 0) === 1 ? "" : "s"} back to the queue.`;
  redirect(`/library?notice=${encodeURIComponent(message)}`);
}
