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
