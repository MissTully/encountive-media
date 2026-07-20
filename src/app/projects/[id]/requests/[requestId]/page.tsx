import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  approveRequest,
  requeueRequest,
  reopenRequest,
  generateCarouselNow,
  setCarouselAudio,
} from "../../../actions";
import { createVideoFromCarousel } from "../../../../videos/actions";
import { VideoPreview, type PreviewSlide } from "@/components/video-preview";

export const dynamic = "force-dynamic";
// In-app generation (copy + per-slide embedding/selection, optional image
// generation and Creatomate renders) can run well past the default window.
export const maxDuration = 300;

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  generating: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

interface SlideRow {
  id: string;
  position: number;
  headline: string | null;
  body_copy: string | null;
  render_path: string | null;
  assets: { storage_path: string } | null;
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; requestId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id, requestId } = await params;
  const notice = ((await searchParams).notice ?? "").trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("content_requests")
    .select("id, topic, brief, target_platform, status")
    .eq("id", requestId)
    .single();
  if (!request) notFound();

  const { data: carousel } = await supabase
    .from("carousels")
    .select("id, status, slide_count, audio_asset_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let slides: Array<
    SlideRow & {
      bgUrl: string | null;
      renderUrl: string | null;
      downloadUrl: string | null;
    }
  > = [];
  if (carousel) {
    const { data: slideRows } = await supabase
      .from("slides")
      .select("id, position, headline, body_copy, render_path, assets(storage_path)")
      .eq("carousel_id", carousel.id)
      .order("position", { ascending: true });

    slides = await Promise.all(
      ((slideRows ?? []) as SlideRow[]).map(async (s) => {
        let bgUrl: string | null = null;
        if (s.assets?.storage_path) {
          const { data } = await supabase.storage
            .from("assets")
            .createSignedUrl(s.assets.storage_path, 3600);
          bgUrl = data?.signedUrl ?? null;
        }
        let renderUrl: string | null = null;
        let downloadUrl: string | null = null;
        if (s.render_path?.startsWith("http")) {
          // Creatomate returns a hosted CDN URL; use it directly.
          renderUrl = s.render_path;
          downloadUrl = s.render_path;
        } else if (s.render_path) {
          const [{ data: view }, { data: dl }] = await Promise.all([
            supabase.storage.from("renders").createSignedUrl(s.render_path, 3600),
            supabase.storage.from("renders").createSignedUrl(s.render_path, 3600, {
              download: `slide-${s.position + 1}.png`,
            }),
          ]);
          renderUrl = view?.signedUrl ?? null;
          downloadUrl = dl?.signedUrl ?? null;
        }
        return { ...s, bgUrl, renderUrl, downloadUrl };
      }),
    );
  }

  // Music library tracks for the soundtrack picker, plus a signed URL for the
  // currently selected track so the video preview can play it.
  const { data: trackRows } = await supabase
    .from("audio_assets")
    .select("id, title, artist")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const tracks = trackRows ?? [];

  let audioUrl: string | null = null;
  let audioLabel: string | null = null;
  if (carousel?.audio_asset_id) {
    const track = tracks.find((t) => t.id === carousel.audio_asset_id);
    if (track) {
      audioLabel = [track.title ?? "Untitled", track.artist]
        .filter(Boolean)
        .join(" — ");
    }
    const { data: audioRow } = await supabase
      .from("audio_assets")
      .select("storage_path")
      .eq("id", carousel.audio_asset_id)
      .single();
    if (audioRow) {
      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioRow.storage_path, 3600);
      audioUrl = data?.signedUrl ?? null;
    }
  }

  const previewSlides: PreviewSlide[] = slides.map((s) => ({
    id: s.id,
    headline: s.headline,
    bodyCopy: s.body_copy,
    imageUrl: s.renderUrl ?? s.bgUrl,
    isRendered: s.renderUrl !== null,
    durationSeconds: 4,
  }));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href={`/projects/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back to project
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {request.topic || "Untitled carousel"}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[request.status] ?? STATUS_STYLES.queued
              }`}
            >
              {request.status}
            </span>
          </div>
          {request.target_platform && (
            <span className="text-sm text-zinc-500">
              {request.target_platform}
            </span>
          )}
          {request.brief && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {request.brief}
            </p>
          )}
        </header>

        {request.status === "in_review" && slides.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
            <span className="flex-1 text-sm text-amber-900 dark:text-amber-300">
              Review the slides below, then approve or send back for changes.
            </span>
            <form action={requeueRequest.bind(null, requestId, id)}>
              <button
                type="submit"
                className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Request changes
              </button>
            </form>
            <form action={approveRequest.bind(null, requestId, id)}>
              <button
                type="submit"
                className="rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Approve
              </button>
            </form>
          </div>
        )}

        {request.status === "approved" && (
          <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
            <span className="flex-1 text-sm font-medium text-green-800 dark:text-green-300">
              ✓ Approved — ready to publish.
            </span>
            <form action={reopenRequest.bind(null, requestId, id)}>
              <button
                type="submit"
                className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Re-open
              </button>
            </form>
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            {notice}
          </div>
        )}

        {(request.status === "queued" || request.status === "generating") && (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center dark:border-blue-900 dark:bg-blue-950">
            <span className="flex-1 text-sm text-blue-800 dark:text-blue-300">
              {request.status === "queued"
                ? "Queued — the scheduled workflow will pick this up, or generate it right now."
                : "Generating… If this has been stuck for a while, the workflow run likely failed — generate it in-app instead."}
            </span>
            <form action={generateCarouselNow.bind(null, requestId, id)}>
              <button
                type="submit"
                className="shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Generate now
              </button>
            </form>
          </div>
        )}

        {carousel && slides.length > 0 && (
          <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Video preview
                </h2>
                <p className="text-sm text-zinc-500">
                  How the finished video will look and sound — each slide holds
                  for a few seconds over your chosen soundtrack.
                </p>
              </div>
              <form action={createVideoFromCarousel.bind(null, requestId, id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Turn into video →
                </button>
              </form>
            </div>

            <VideoPreview
              slides={previewSlides}
              audioUrl={audioUrl}
              audioLabel={audioLabel}
            />

            <form
              action={setCarouselAudio.bind(null, carousel.id, requestId, id)}
              className="flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center dark:border-zinc-900"
            >
              <label
                htmlFor="audio_asset_id"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Soundtrack
              </label>
              <select
                id="audio_asset_id"
                name="audio_asset_id"
                defaultValue={carousel.audio_asset_id ?? ""}
                className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">None (silent)</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {[t.title ?? "Untitled", t.artist].filter(Boolean).join(" — ")}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Set soundtrack
              </button>
              {tracks.length === 0 && (
                <Link
                  href="/music/upload"
                  className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
                >
                  Upload music first
                </Link>
              )}
            </form>
          </section>
        )}

        {slides.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {request.status === "queued"
              ? "Queued — waiting for the generation workflow to write the slides."
              : "No slides yet."}
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {slides.map((s) => (
              <li
                key={s.id}
                className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                  {s.renderUrl || s.bgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(s.renderUrl ?? s.bgUrl) as string}
                      alt={`Slide ${s.position + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      no image
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs uppercase tracking-widest text-zinc-400">
                    Slide {s.position + 1}
                  </span>
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {s.headline ?? "—"}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {s.body_copy ?? ""}
                  </p>
                  {s.downloadUrl && (
                    <a
                      href={s.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-auto self-start text-xs font-medium text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
                    >
                      ⬇ Download slide
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
