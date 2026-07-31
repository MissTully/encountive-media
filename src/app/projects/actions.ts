"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { generateCarousel } from "@/lib/carousel";
import { askCreativeDirector } from "@/lib/gemini";

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

/**
 * Generate a carousel right now, in-app, instead of waiting for the n8n
 * Workflow C poller — see src/lib/carousel.ts. Also the recovery path for
 * requests a crashed n8n run left stranded at `generating`.
 */
export async function generateCarouselNow(
  requestId: string,
  projectId: string,
) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const result = await generateCarousel(supabase, ctx.profile.org_id, requestId);

  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
  redirect(
    `/projects/${projectId}/requests/${requestId}?notice=${encodeURIComponent(result.message)}`,
  );
}

/** Attach (or clear) the music track behind a carousel's video preview. */
export async function setCarouselAudio(
  carouselId: string,
  requestId: string,
  projectId: string,
  formData: FormData,
) {
  const audioAssetId = String(formData.get("audio_asset_id") ?? "").trim();

  // Server actions are reachable via direct POST — verify the session before
  // writing (RLS alone fails silently on zero matched rows).
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("carousels")
    .update({ audio_asset_id: audioAssetId || null })
    .eq("id", carouselId);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
  redirect(
    `/projects/${projectId}/requests/${requestId}?notice=${encodeURIComponent(
      audioAssetId ? "Saved — soundtrack attached." : "Soundtrack cleared.",
    )}`,
  );
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

/** Add a review comment to a single slide (slide-level change request). */
export async function addSlideComment(
  slideId: string,
  requestId: string,
  projectId: string,
  formData: FormData,
) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.from("slide_comments").insert({
    slide_id: slideId,
    author_id: ctx.profile.id,
    body,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
}

/** Mark a slide comment resolved (or reopen it). */
export async function setSlideCommentResolved(
  commentId: string,
  requestId: string,
  projectId: string,
  resolved: boolean,
) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("slide_comments")
    .update({ resolved })
    .eq("id", commentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}/requests/${requestId}`);
}

/**
 * Queue a fresh carousel with the same topic, brief, and platform — reuse a
 * structure that worked for a follow-up post without retyping the brief.
 */
export async function duplicateRequest(requestId: string, projectId: string) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: original } = await supabase
    .from("content_requests")
    .select("project_id, brand_kit_id, topic, brief, target_platform")
    .eq("id", requestId)
    .single();
  if (!original) return;

  const { data: copy, error } = await supabase
    .from("content_requests")
    .insert({
      project_id: original.project_id,
      brand_kit_id: original.brand_kit_id,
      topic: original.topic,
      brief: original.brief,
      target_platform: original.target_platform,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  redirect(
    `/projects/${projectId}/requests/${copy.id}?notice=${encodeURIComponent("Duplicated — generate when ready.")}`,
  );
}

/**
 * Ask the project's Creative Director agent for design direction. Saves the
 * user's question, calls Gemini with the project's moodboard, brand voice,
 * carousel pipeline, and conversation history as context, then saves the
 * agent's reply. On a Gemini failure the question is kept and the user is
 * sent back with an error notice, so nothing typed is ever lost.
 */
export async function askProjectCreativeDirector(
  projectId: string,
  formData: FormData,
) {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return;

  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (!project) return;

  // Context: moodboard images, carousels in flight, brand voice, and the
  // conversation so far (last 20 turns keeps the prompt bounded).
  const [{ data: boardRows }, { data: requests }, { data: kit }, { data: history }] =
    await Promise.all([
      supabase
        .from("project_assets")
        .select("assets(title, description)")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      supabase
        .from("content_requests")
        .select("topic, target_platform, status")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("brand_kits")
        .select("voice_guidelines")
        .eq("org_id", ctx.profile.org_id)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_agent_messages")
        .select("role, body")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const boardSummary =
    (boardRows ?? [])
      .map((r) => r.assets as { title: string | null; description: string | null } | null)
      .filter((a): a is { title: string | null; description: string | null } =>
        Boolean(a),
      )
      .map((a) => `- ${a.title ?? "Untitled"}: ${a.description ?? "(no description)"}`)
      .join("\n") || null;

  const requestsSummary =
    (requests ?? [])
      .map((r) => `- "${r.topic ?? "Untitled"}" for ${r.target_platform ?? "social"} (${r.status})`)
      .join("\n") || null;

  const { error: insertError } = await supabase
    .from("project_agent_messages")
    .insert({
      project_id: projectId,
      author_id: ctx.profile.id,
      role: "user",
      body: question,
    });
  if (insertError) throw new Error(insertError.message);
  revalidatePath(`/projects/${projectId}`);

  let reply: string;
  try {
    reply = await askCreativeDirector({
      projectName: project.name,
      boardSummary,
      requestsSummary,
      voiceGuidelines: kit?.voice_guidelines ?? null,
      history: (history ?? [])
        .reverse()
        .map((m) => ({ role: m.role as "user" | "agent", body: m.body })),
      question,
    });
  } catch {
    redirect(
      `/projects/${projectId}?agent_error=${encodeURIComponent(
        "The Creative Director couldn't answer just now — your question was saved, ask again in a moment.",
      )}#creative-director`,
    );
  }

  const { error: replyError } = await supabase
    .from("project_agent_messages")
    .insert({ project_id: projectId, role: "agent", body: reply });
  if (replyError) throw new Error(replyError.message);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}#creative-director`);
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
