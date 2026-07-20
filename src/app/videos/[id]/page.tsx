import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasCreatomateKey } from "@/lib/creatomate";
import { trackLabel } from "@/lib/format";
import { firstParam } from "@/lib/search";
import { ShareCard } from "@/components/share-card";
import { publishVideoToSocial } from "../../social/actions";
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

  const { data: connections } = await supabase
    .from("social_connections")
    .select("id, provider, display_name, account_scope")
    .eq("status", "connected")
    .order("provider", { ascending: true });

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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
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

        <ShareCard
          action={publishVideoToSocial.bind(null, video.id)}
          connections={connections ?? []}
          ready={video.status === "ready" && Boolean(video.output_path)}
          readyHint="Render the MP4 first — the finished file is what gets posted."
        />
      </main>
    </div>
  );
}
