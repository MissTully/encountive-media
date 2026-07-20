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
  addSlideComment,
  setSlideCommentResolved,
  duplicateRequest,
} from "../../../actions";
import { publishRequest } from "../../../publish-actions";
import { createVideoFromCarousel } from "../../../../videos/actions";
import { trackLabel } from "@/lib/format";
import { firstParam } from "@/lib/search";
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

interface SlideComment {
  id: string;
  body: string;
  resolved: boolean;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

interface SlideRow {
  id: string;
  position: number;
  headline: string | null;
  body_copy: string | null;
  render_path: string | null;
  assets: { storage_path: string } | null;
  slide_comments: SlideComment[];
}

// Aspect-ratio presets for "Turn into video" — keys match the FORMATS map in
// src/app/videos/actions.ts. Defaulted per platform so the video starts in the
// shape that platform favors; changeable before creating.
const VIDEO_FORMATS = [
  { value: "reel", label: "9:16 — Reels / Stories / TikTok" },
  { value: "portrait", label: "4:5 — Portrait feed" },
  { value: "square", label: "1:1 — Square feed" },
  { value: "landscape", label: "16:9 — Landscape / X" },
];
const PLATFORM_DEFAULT_FORMAT: Record<string, string> = {
  instagram: "reel",
  linkedin: "square",
  facebook: "square",
  twitter: "landscape",
};

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; requestId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { id, requestId } = await params;
  const notice = firstParam((await searchParams).notice).trim();
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
      .select(
        "id, position, headline, body_copy, render_path, assets(storage_path), slide_comments(id, body, resolved, created_at, profiles(full_name))",
      )
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
        return {
          ...s,
          slide_comments: [...(s.slide_comments ?? [])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at),
          ),
          bgUrl,
          renderUrl,
          downloadUrl,
        };
      }),
    );
  }

  const openCommentCount = slides.reduce(
    (sum, s) => sum + s.slide_comments.filter((c) => !c.resolved).length,
    0,
  );

  // Publishing (approved requests only): connected destinations plus the log
  // of every publish attempt so far for this request.
  let socialAccounts: Array<{
    id: string;
    platform: string;
    display_name: string;
  }> = [];
  let publications: Array<{
    id: string;
    status: string;
    post_url: string | null;
    error: string | null;
    created_at: string;
    social_accounts: { platform: string; display_name: string } | null;
  }> = [];
  if (request.status === "approved") {
    const [{ data: accountRows }, { data: pubRows }] = await Promise.all([
      supabase
        .from("social_accounts")
        .select("id, platform, display_name")
        .order("created_at", { ascending: true }),
      supabase
        .from("publications")
        .select(
          "id, status, post_url, error, created_at, social_accounts(platform, display_name)",
        )
        .eq("request_id", requestId)
        .order("created_at", { ascending: false }),
    ]);
    socialAccounts = accountRows ?? [];
    publications = (pubRows ?? []) as typeof publications;
  }

  // Starting point for the caption — the reviewer edits before publishing.
  const defaultCaption = [
    request.topic ?? "",
    slides
      .map((s) => s.headline)
      .filter(Boolean)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  // Music library tracks for the soundtrack picker (storage_path included so
  // the selected track needs no second query), plus a signed URL for the
  // currently selected track so the video preview can play it.
  const { data: trackRows } = await supabase
    .from("audio_assets")
    .select("id, title, artist, storage_path")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const tracks = trackRows ?? [];

  let audioUrl: string | null = null;
  let audioLabel: string | null = null;
  const selectedTrack = tracks.find((t) => t.id === carousel?.audio_asset_id);
  if (selectedTrack) {
    audioLabel = trackLabel(selectedTrack.title, selectedTrack.artist);
    const { data } = await supabase.storage
      .from("audio")
      .createSignedUrl(selectedTrack.storage_path, 3600);
    audioUrl = data?.signedUrl ?? null;
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
    <div className="flex flex-1 flex-col items-center font-sans">
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
            <form action={duplicateRequest.bind(null, requestId, id)} className="ml-auto">
              <button
                type="submit"
                title="Queue a new carousel with the same topic, brief, and platform"
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ⧉ Duplicate
              </button>
            </form>
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
              {openCommentCount > 0
                ? `${openCommentCount} open change request${openCommentCount === 1 ? "" : "s"} on individual slides — regenerating will apply them.`
                : "Review the slides below — comment on individual slides to request targeted changes, then approve or send back."}
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
              ✓ Approved — publish it below.
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

        {request.status === "approved" && (
          <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Publish
              </h2>
              <p className="text-sm text-zinc-500">
                Post the rendered slides straight to a connected account. Each
                press publishes once and is recorded below.
              </p>
            </div>

            {socialAccounts.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No destinations connected yet —{" "}
                <Link
                  href="/connections"
                  className="underline hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  connect an account
                </Link>{" "}
                first.
              </p>
            ) : (
              <form
                action={publishRequest.bind(null, requestId, id)}
                className="flex flex-col gap-3"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Caption
                  </span>
                  <textarea
                    name="caption"
                    rows={4}
                    defaultValue={defaultCaption}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    name="social_account_id"
                    className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {socialAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Publish now →
                  </button>
                </div>
              </form>
            )}

            {publications.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Publish log
                </h3>
                {publications.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "published"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : p.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {p.status}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-zinc-800 dark:text-zinc-200">
                        {p.social_accounts?.display_name ?? "Removed account"}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {new Date(p.created_at).toLocaleString()}
                      </span>
                      {p.status === "failed" && p.error && (
                        <p className="mt-0.5 break-words text-xs text-red-600 dark:text-red-400">
                          {p.error}
                        </p>
                      )}
                    </div>
                    {p.post_url && (
                      <a
                        href={p.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium underline hover:no-underline"
                      >
                        View post ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
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
              <form
                action={createVideoFromCarousel.bind(null, requestId, id)}
                className="flex shrink-0 items-center gap-2"
              >
                <select
                  name="format"
                  title="Video aspect ratio"
                  defaultValue={
                    PLATFORM_DEFAULT_FORMAT[request.target_platform ?? ""] ??
                    "portrait"
                  }
                  className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                >
                  {VIDEO_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
                    {trackLabel(t.title, t.artist)}
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
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex gap-4">
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
                </div>

                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
                  {s.slide_comments.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                        c.resolved
                          ? "bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500"
                          : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="mr-2 text-xs font-medium">
                          {c.profiles?.full_name ?? "Reviewer"}
                        </span>
                        <span className={c.resolved ? "line-through" : ""}>
                          {c.body}
                        </span>
                      </div>
                      <form
                        action={setSlideCommentResolved.bind(
                          null,
                          c.id,
                          requestId,
                          id,
                          !c.resolved,
                        )}
                      >
                        <button
                          type="submit"
                          className="shrink-0 text-xs underline hover:no-underline"
                        >
                          {c.resolved ? "Reopen" : "Resolve"}
                        </button>
                      </form>
                    </div>
                  ))}
                  <form
                    action={addSlideComment.bind(null, s.id, requestId, id)}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      name="body"
                      required
                      placeholder="Request a change to this slide…"
                      className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Comment
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
