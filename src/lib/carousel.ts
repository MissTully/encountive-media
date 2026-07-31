import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { writeCarouselCopy, generateImage } from "@/lib/gemini";
import { embedText } from "@/lib/embeddings";
import { runCreatomateRender, slideElements } from "@/lib/creatomate";

/**
 * In-app carousel generation — the full Workflow C pipeline (spec section 6),
 * including the two steps the n8n workflow never implemented
 * (docs/n8n-workflow-c.md "Not yet implemented"):
 *
 *   1. image-generation fallback when no library asset clears the similarity
 *      threshold (spec step 4c), and
 *   2. persisting renders into the private `renders` bucket + setting
 *      carousels.output_path, instead of relying on Creatomate's ~30-day CDN.
 *
 * Runs under the signed-in user's Supabase session, so RLS scopes everything
 * to their org. Rendering is optional: without CREATOMATE_API_KEY the carousel
 * still generates copy + backgrounds and goes to review un-rendered.
 */

type Supabase = SupabaseClient<Database>;

/** Same threshold the n8n flow uses for pick_slide_asset. */
const MATCH_THRESHOLD = 0.5;

export interface GenerateResult {
  ok: boolean;
  message: string;
}

export async function generateCarousel(
  supabase: Supabase,
  orgId: string,
  requestId: string,
): Promise<GenerateResult> {
  const { data: request } = await supabase
    .from("content_requests")
    .select("id, project_id, brand_kit_id, topic, brief, target_platform, status")
    .eq("id", requestId)
    .single();
  if (!request) return { ok: false, message: "Request not found." };
  if (request.status === "approved" || request.status === "in_review") {
    return { ok: false, message: `Request is already ${request.status}.` };
  }

  // Claim it (queued or stranded at generating) so the n8n poller skips it.
  const { data: claimed } = await supabase
    .from("content_requests")
    .update({ status: "generating" })
    .eq("id", requestId)
    .in("status", ["queued", "generating"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return { ok: false, message: "Request was picked up by another run." };
  }

  // Slide-level change requests: open comments on the previous revision's
  // slides become targeted revision notes for the copywriter, and are marked
  // resolved once the new carousel has been generated from them.
  const revision = await loadRevisionNotes(supabase, requestId);

  // Only the carousel this run creates may be cleaned up on failure — earlier
  // revisions (and their review comments) must survive a failed regeneration.
  let newCarouselId: string | null = null;

  try {
    // Brand voice: the request's kit, or the org's first kit as default.
    let voiceGuidelines: string | null = null;
    const kitQuery = supabase.from("brand_kits").select("voice_guidelines");
    const { data: kit } = request.brand_kit_id
      ? await kitQuery.eq("id", request.brand_kit_id).maybeSingle()
      : await kitQuery.eq("org_id", orgId).order("created_at").limit(1).maybeSingle();
    voiceGuidelines = kit?.voice_guidelines ?? null;

    const slides = await writeCarouselCopy({
      topic: request.topic,
      brief: request.brief,
      targetPlatform: request.target_platform,
      voiceGuidelines,
      revisionNotes: revision.notes,
    });

    const { data: carousel, error: carouselError } = await supabase
      .from("carousels")
      .insert({
        request_id: requestId,
        status: "in_review",
        slide_count: slides.length,
      })
      .select("id")
      .single();
    if (carouselError || !carousel) {
      throw new Error(carouselError?.message ?? "carousel insert failed");
    }
    newCarouselId = carousel.id;

    const warnings: string[] = [];
    let rendered = 0;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // Reuse-aware selection: board first, then library (pick_slide_asset),
      // and only generate a new image when nothing clears the threshold.
      const embedding = await embedText(slide.image_need);
      const { data: picked, error: pickError } = await supabase.rpc(
        "pick_slide_asset",
        {
          query_embedding: JSON.stringify(embedding),
          p_project_id: request.project_id,
          match_threshold: MATCH_THRESHOLD,
        },
      );
      if (pickError) throw new Error(`pick_slide_asset: ${pickError.message}`);

      let assetId = picked?.[0]?.asset_id ?? null;
      let assetPath = picked?.[0]?.storage_path ?? null;

      if (!assetId) {
        try {
          const generated = await generateNewAsset(
            supabase,
            orgId,
            slide.image_need,
            embedding,
          );
          assetId = generated.id;
          assetPath = generated.storage_path;
        } catch (e) {
          warnings.push(
            `slide ${i + 1}: image generation failed (${e instanceof Error ? e.message : e})`,
          );
        }
      }

      const { data: slideRow, error: slideError } = await supabase
        .from("slides")
        .insert({
          carousel_id: carousel.id,
          position: i,
          headline: slide.headline,
          body_copy: slide.body_copy,
          asset_id: assetId,
        })
        .select("id")
        .single();
      if (slideError || !slideRow) {
        throw new Error(slideError?.message ?? "slide insert failed");
      }

      // Render is best-effort: a slide without a render still goes to review
      // showing its raw background.
      if (assetPath && process.env.CREATOMATE_API_KEY) {
        try {
          const renderPath = await renderAndPersistSlide(supabase, {
            orgId,
            carouselId: carousel.id,
            position: i,
            headline: slide.headline,
            bodyCopy: slide.body_copy,
            backgroundPath: assetPath,
          });
          await supabase
            .from("slides")
            .update({ render_path: renderPath })
            .eq("id", slideRow.id);
          rendered++;
        } catch (e) {
          warnings.push(
            `slide ${i + 1}: render failed (${e instanceof Error ? e.message : e})`,
          );
        }
      }
    }

    if (rendered > 0) {
      await supabase
        .from("carousels")
        .update({ output_path: `${orgId}/${carousel.id}` })
        .eq("id", carousel.id);
    }

    await supabase
      .from("content_requests")
      .update({ status: "in_review" })
      .eq("id", requestId);

    // The change requests have been worked into this revision — close them so
    // the next regeneration doesn't re-apply stale feedback.
    if (revision.openCommentIds.length > 0) {
      await supabase
        .from("slide_comments")
        .update({ resolved: true })
        .in("id", revision.openCommentIds);
    }

    let message = `Generated ${slides.length} slides`;
    if (process.env.CREATOMATE_API_KEY) {
      message += `, rendered ${rendered}`;
    } else {
      message += " (rendering skipped — CREATOMATE_API_KEY not configured)";
    }
    if (revision.openCommentIds.length > 0) {
      message += `, applying ${revision.openCommentIds.length} slide change request${revision.openCommentIds.length === 1 ? "" : "s"}`;
    }
    if (warnings.length > 0) message += `. Warnings: ${warnings.join("; ")}`;
    return { ok: true, message };
  } catch (e) {
    // Leave no half-finished carousel behind — but only the one this run
    // created; earlier revisions and their comments must survive — and requeue
    // the request so it can be retried (by this button or by n8n).
    if (newCarouselId) {
      await supabase.from("slides").delete().eq("carousel_id", newCarouselId);
      await supabase.from("carousels").delete().eq("id", newCarouselId);
    }
    await supabase
      .from("content_requests")
      .update({ status: "queued" })
      .eq("id", requestId);
    return {
      ok: false,
      message: `Generation failed and the request was re-queued: ${e instanceof Error ? e.message : e}`,
    };
  }
}

interface RevisionNotes {
  /** Pre-formatted previous copy + reviewer requests, or null on first runs. */
  notes: string | null;
  /** The open comments the notes were built from, to resolve on success. */
  openCommentIds: string[];
}

/**
 * Build targeted revision notes from the latest carousel's slides and their
 * open (unresolved) review comments. Returns notes = null when there is no
 * previous carousel or no open comments — i.e. a regeneration without slide
 * feedback stays a clean rewrite, exactly as before.
 */
async function loadRevisionNotes(
  supabase: Supabase,
  requestId: string,
): Promise<RevisionNotes> {
  const empty: RevisionNotes = { notes: null, openCommentIds: [] };

  const { data: previous } = await supabase
    .from("carousels")
    .select("id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previous) return empty;

  const { data: slides } = await supabase
    .from("slides")
    .select("position, headline, body_copy, slide_comments(id, body, resolved)")
    .eq("carousel_id", previous.id)
    .order("position", { ascending: true });
  if (!slides) return empty;

  const openCommentIds: string[] = [];
  const lines = slides.map((s) => {
    const open = (s.slide_comments ?? []).filter((c) => !c.resolved);
    openCommentIds.push(...open.map((c) => c.id));
    const copy = `Slide ${s.position + 1}: "${s.headline ?? ""}" — ${s.body_copy ?? ""}`;
    if (open.length === 0) return copy;
    return `${copy}\n${open.map((c) => `  Change request: ${c.body}`).join("\n")}`;
  });
  if (openCommentIds.length === 0) return empty;

  return { notes: lines.join("\n"), openCommentIds };
}

/**
 * Spec step 4c: generate a background with the Gemini image model, store it in
 * the assets bucket + table (source = generated, with embedding) so future
 * carousels can reuse it, and return it for this slide.
 */
async function generateNewAsset(
  supabase: Supabase,
  orgId: string,
  imageNeed: string,
  embedding: number[],
): Promise<{ id: string; storage_path: string }> {
  const png = await generateImage(imageNeed);
  const storagePath = `${orgId}/generated-${crypto.randomUUID()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, png, { contentType: "image/png", upsert: false });
  if (uploadError) throw new Error(`asset upload: ${uploadError.message}`);

  const title =
    imageNeed.length > 60 ? `${imageNeed.slice(0, 57)}…` : imageNeed;
  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      org_id: orgId,
      storage_path: storagePath,
      title,
      description: imageNeed,
      tags: ["generated"],
      source: "generated",
      status: "ready",
      mime_type: "image/png",
      embedding: JSON.stringify(embedding),
    })
    .select("id, storage_path")
    .single();
  if (insertError || !asset) {
    await supabase.storage.from("assets").remove([storagePath]);
    throw new Error(`asset insert: ${insertError?.message ?? "failed"}`);
  }
  return asset;
}

/**
 * Render one slide with Creatomate (submit → poll → fetch, spec constraint 4)
 * and persist the finished image into the private `renders` bucket. Returns
 * the storage path stored in slides.render_path.
 */
async function renderAndPersistSlide(
  supabase: Supabase,
  slide: {
    orgId: string;
    carouselId: string;
    position: number;
    headline: string | null;
    bodyCopy: string | null;
    backgroundPath: string;
  },
): Promise<string> {
  const { data: signed, error: signError } = await supabase.storage
    .from("assets")
    .createSignedUrl(slide.backgroundPath, 3600);
  if (signError || !signed) {
    throw new Error(`sign background: ${signError?.message ?? "failed"}`);
  }

  // Inline source (no Creatomate template needed) using the shared slide
  // composition (src/lib/creatomate.ts), so still slides, video clips, and
  // the in-app preview all render the same layout. 1080x1350 = 4:5 portrait.
  // Stills finish in seconds — 90s poll cap is generous.
  const bytes = await runCreatomateRender(
    {
      output_format: "png",
      width: 1080,
      height: 1350,
      elements: slideElements({
        imageUrl: signed.signedUrl,
        headline: slide.headline,
        bodyCopy: slide.bodyCopy,
      }),
    },
    90_000,
  );

  const renderPath = `${slide.orgId}/${slide.carouselId}/slide-${slide.position + 1}.png`;
  const { error: uploadError } = await supabase.storage
    .from("renders")
    .upload(renderPath, bytes, { contentType: "image/png", upsert: true });
  if (uploadError) {
    throw new Error(`render upload: ${uploadError.message}`);
  }
  return renderPath;
}
