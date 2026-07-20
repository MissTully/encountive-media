"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { publishTo } from "@/lib/publish";
import type { SocialPlatform } from "@/types";

/**
 * Publish an approved carousel to one connected social account, directly via
 * that platform's API. Every attempt is recorded as a `publications` row so
 * the review screen shows where the carousel actually went; a failed attempt
 * keeps its error message and can simply be retried with another press.
 */
export async function publishRequest(
  requestId: string,
  projectId: string,
  formData: FormData,
) {
  const accountId = String(formData.get("social_account_id") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();
  if (!accountId) return;

  // Server actions are reachable via direct POST — verify the session before
  // writing (RLS alone fails silently on zero matched rows).
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const back = `/projects/${projectId}/requests/${requestId}`;
  const fail = (message: string) =>
    redirect(`${back}?notice=${encodeURIComponent(message)}`);

  // Publishing is only offered on approved requests (human approval first).
  const { data: request } = await supabase
    .from("content_requests")
    .select("id, status")
    .eq("id", requestId)
    .single();
  if (!request || request.status !== "approved") {
    return fail("Only approved carousels can be published.");
  }

  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, platform, display_name, external_id, access_token")
    .eq("id", accountId)
    .single();
  if (!account) return fail("That account is no longer connected.");

  const { data: carousel } = await supabase
    .from("carousels")
    .select("id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!carousel) return fail("No carousel to publish yet.");

  const { data: slides } = await supabase
    .from("slides")
    .select("position, render_path")
    .eq("carousel_id", carousel.id)
    .order("position", { ascending: true });

  const unrendered = (slides ?? []).filter((s) => !s.render_path);
  if (!slides || slides.length === 0 || unrendered.length > 0) {
    return fail(
      "Slides aren't rendered yet — run generation with rendering enabled first.",
    );
  }

  // Platforms fetch (or we re-upload) each image over plain HTTPS, so give
  // them URLs that work without our auth: Creatomate CDN URLs as-is, storage
  // paths as signed URLs long enough to outlive the whole publish flow.
  const imageUrls: string[] = [];
  for (const s of slides) {
    const path = s.render_path as string;
    if (path.startsWith("http")) {
      imageUrls.push(path);
    } else {
      const { data } = await supabase.storage
        .from("renders")
        .createSignedUrl(path, 3600);
      if (!data?.signedUrl) return fail("Could not sign a slide URL.");
      imageUrls.push(data.signedUrl);
    }
  }

  const { data: publication, error: insertError } = await supabase
    .from("publications")
    .insert({
      request_id: requestId,
      social_account_id: account.id,
      caption,
      status: "publishing",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  let notice: string;
  try {
    const result = await publishTo(account.platform as SocialPlatform, {
      imageUrls,
      caption,
      accountRef: account.external_id,
      accessToken: account.access_token,
    });
    await supabase
      .from("publications")
      .update({
        status: "published",
        post_ref: result.postRef,
        post_url: result.postUrl,
        published_at: new Date().toISOString(),
      })
      .eq("id", publication.id);
    notice = `Published to ${account.display_name}.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("publications")
      .update({ status: "failed", error: message.slice(0, 1000) })
      .eq("id", publication.id);
    notice = `Publishing to ${account.display_name} failed — see the publish log.`;
  }

  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent(notice)}`);
}
