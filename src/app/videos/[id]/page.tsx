import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasCreatomateKey } from "@/lib/creatomate";
import { trackLabel } from "@/lib/format";
import { firstParam } from "@/lib/search";
import { publishVideo } from "../publish-actions";
import { Editor, type EditorClip } from "./editor";

// Always render fresh so clip edits and render status reflect live data.
export const dynamic = "force-dynamic";
// Rendering an MP4 in-request (submit → poll → fetch → persist) can run for
// a few minutes on longer videos.
export const maxDuration = 300;

// How many recent library images the "add clips" picker offers (searchable
// client-side). Keeps the page from signing hundreds of thumbnail URLs.
const PICKER_LIMIT = 60;

export default async function VideoEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { id } = await params;
  const notice = firstParam((await searchParams).notice).trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  // The video, its clips, both picker libraries, and the music tracks are
  // independent — fetch them in parallel.
  const [
    { data: video },
    { data: clipRows },
    { data: assetRows },
    { data: videoAssetRows },
    { data: trackRows },
  ] = await Promise.all([
    supabase
      .from("videos")
      .select(
        "id, title, status, width, height, audio_asset_id, output_path, render_error",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("video_clips")
      .select(
        "id, position, headline, body_copy, duration_seconds, assets(storage_path), video_assets(storage_path)",
      )
      .eq("video_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("assets")
      .select("id, storage_path, title")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(PICKER_LIMIT),
    supabase
      .from("video_assets")
      .select("id, storage_path, title, duration_seconds")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(PICKER_LIMIT),
    supabase
      .from("audio_assets")
      .select("id, title, artist, storage_path")
      .eq("status", "ready")
      .order("created_at", { ascending: false }),
  ]);
  if (!video) notFound();

  // Publishing: connected destinations plus this video's publish log.
  const [{ data: socialAccounts }, { data: publications }] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id, platform, display_name")
      .order("created_at", { ascending: true }),
    supabase
      .from("publications")
      .select(
        "id, status, post_url, error, created_at, social_accounts(platform, display_name)",
      )
      .eq("video_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Sign everything in one batch per bucket, then look up by path.
  const rows = (clipRows ?? []) as Array<{
    id: string;
    headline: string | null;
    body_copy: string | null;
    duration_seconds: number;
    assets: { storage_path: string } | null;
    video_assets: { storage_path: string } | null;
  }>;
  const assetPaths = [
    ...rows.flatMap((c) => (c.assets ? [c.assets.storage_path] : [])),
    ...(assetRows ?? []).map((a) => a.storage_path),
  ];
  const clipBucketPaths = [
    ...rows.flatMap((c) =>
      !c.assets && c.video_assets ? [c.video_assets.storage_path] : [],
    ),
    ...(videoAssetRows ?? []).map((a) => a.storage_path),
  ];
  const [assetSigned, clipBucketSigned] = await Promise.all([
    assetPaths.length
      ? supabase.storage.from("assets").createSignedUrls(assetPaths, 3600)
      : Promise.resolve({ data: [] }),
    clipBucketPaths.length
      ? supabase.storage.from("clips").createSignedUrls(clipBucketPaths, 3600)
      : Promise.resolve({ data: [] }),
  ]);
  const urlByPath = new Map<string, string>();
  assetPaths.forEach((p, i) => {
    const url = assetSigned.data?.[i]?.signedUrl;
    if (url) urlByPath.set(p, url);
  });
  clipBucketPaths.forEach((p, i) => {
    const url = clipBucketSigned.data?.[i]?.signedUrl;
    if (url) urlByPath.set(p, url);
  });

  const clips: EditorClip[] = rows.map((c) => {
    const path = c.assets?.storage_path ?? c.video_assets?.storage_path ?? null;
    return {
      id: c.id,
      headline: c.headline,
      bodyCopy: c.body_copy,
      durationSeconds: Number(c.duration_seconds),
      imageUrl: path ? (urlByPath.get(path) ?? null) : null,
      mediaType: c.assets ? ("image" as const) : ("video" as const),
    };
  });

  const pickerAssets = (assetRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    url: urlByPath.get(a.storage_path) ?? null,
  }));
  const pickerClips = (videoAssetRows ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    url: urlByPath.get(a.storage_path) ?? null,
    durationSeconds: a.duration_seconds,
  }));

  // Music tracks for the soundtrack picker + a signed URL for the selection.
  const tracks = (trackRows ?? []).map((t) => ({
    id: t.id,
    label: trackLabel(t.title, t.artist),
  }));

  let audioUrl: string | null = null;
  const selectedTrack = (trackRows ?? []).find(
    (t) => t.id === video.audio_asset_id,
  );
  if (selectedTrack) {
    const { data } = await supabase.storage
      .from("audio")
      .createSignedUrl(selectedTrack.storage_path, 3600);
    audioUrl = data?.signedUrl ?? null;
  }

  // The finished MP4: one URL to play inline, one that downloads as a file.
  let outputUrl: string | null = null;
  let downloadUrl: string | null = null;
  if (video.output_path) {
    const [{ data: play }, { data: dl }] = await Promise.all([
      supabase.storage.from("renders").createSignedUrl(video.output_path, 3600),
      supabase.storage.from("renders").createSignedUrl(video.output_path, 3600, {
        download: `${video.title.replace(/[^\w\- ]+/g, "").trim() || "video"}.mp4`,
      }),
    ]);
    outputUrl = play?.signedUrl ?? null;
    downloadUrl = dl?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/videos"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← All videos
          </Link>
        </header>

        <Editor
          video={{
            id: video.id,
            title: video.title,
            status: video.status,
            width: video.width,
            height: video.height,
            audioAssetId: video.audio_asset_id,
            renderError: video.render_error,
          }}
          clips={clips}
          pickerAssets={pickerAssets}
          pickerClips={pickerClips}
          tracks={tracks}
          audioUrl={audioUrl}
          outputUrl={outputUrl}
          downloadUrl={downloadUrl}
          creatomateReady={hasCreatomateKey()}
          notice={notice}
        />

        {/* Publish — same panel + log as approved carousels, for the MP4. */}
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Publish
            </h2>
            <p className="text-sm text-zinc-500">
              Post the rendered MP4 straight to a connected account — a Reel on
              Instagram, a Page video on Facebook, a video post on LinkedIn.
              Each press publishes once and is recorded below.
            </p>
          </div>

          {(socialAccounts ?? []).length === 0 ? (
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
          ) : video.status !== "ready" || !video.output_path ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Render the MP4 first — the finished file is what gets published.
            </p>
          ) : (
            <form
              action={publishVideo.bind(null, video.id)}
              className="flex flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Caption
                </span>
                <textarea
                  name="caption"
                  rows={4}
                  defaultValue={video.title}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  name="social_account_id"
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {(socialAccounts ?? []).map((a) => (
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

          {(publications ?? []).length > 0 && (
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Publish log
              </h3>
              {(publications ?? []).map((p) => (
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
                      {(p.social_accounts as { display_name: string } | null)
                        ?.display_name ?? "Removed account"}
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
      </main>
    </div>
  );
}
