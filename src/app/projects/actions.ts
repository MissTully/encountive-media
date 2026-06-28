"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/** Create a project in the current user's org, then open its board. */
export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: ctx.profile.org_id, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

/** Attach selected assets to a project board (one project_assets row each). */
export async function addAssetsToProject(
  projectId: string,
  assetIds: string[],
) {
  if (assetIds.length === 0) return;

  const supabase = await createClient();
  // New items go after any existing ones on the board.
  const { count } = await supabase
    .from("project_assets")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  const base = count ?? 0;

  const rows = assetIds.map((asset_id, i) => ({
    project_id: projectId,
    asset_id,
    position: base + i,
  }));

  const { error } = await supabase
    .from("project_assets")
    .upsert(rows, { onConflict: "project_id,asset_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}

/** Queue a carousel content request for a project (picked up by n8n Workflow C). */
export async function createContentRequest(
  projectId: string,
  formData: FormData,
) {
  const topic = String(formData.get("topic") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const targetPlatform = String(formData.get("target_platform") ?? "").trim();
  if (!topic && !brief) return;

  const supabase = await createClient();
  const { error } = await supabase.from("content_requests").insert({
    project_id: projectId,
    topic: topic || null,
    brief: brief || null,
    target_platform: targetPlatform || null,
    status: "queued",
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}

/** Approve a carousel that's in review (human approval before publishing). */
export async function approveRequest(requestId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_requests")
    .update({ status: "approved" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
}

/** Send a carousel back for regeneration (Workflow C will pick it up again). */
export async function requeueRequest(requestId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_requests")
    .update({ status: "queued" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
}

/** Re-open an approved carousel for another review. */
export async function reopenRequest(requestId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_requests")
    .update({ status: "in_review" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
}

/** Remove a single asset from a project board. */
export async function removeAssetFromProject(
  projectId: string,
  assetId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("asset_id", assetId);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
}
