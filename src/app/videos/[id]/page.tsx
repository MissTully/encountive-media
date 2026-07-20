import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasCreatomateKey } from "@/lib/video";
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
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const notice = ((await searchParams).notice ?? "").trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, title, status, width, height, audio_asset_id, output_path, render_error",
    )
    .eq("id", id)
    .single();
  if (!video) notFound();

  // Timeline clips with signed thumbnails.
  const { data: clipRows } = await supabase
    .from("video_clips")
    .select(
      "id, position, headline, body_copy, duration_seconds, assets(storage_path)",
    )
    .eq("video_id", id)
    .order("position", { ascending: true });

  const clips: EditorClip[] = await Promise.all(
    (clipRows ?? []).map(async (c) => {
      const storagePath = (c.assets as { storage_path: string } | null)
        ?.storage_path;
      let imageUrl: string | null = null;
      if (storagePath) {
        const { data } = await supabase.storage
          .from("assets")
          .createSignedUrl(storagePath, 3600);
        imageUrl = data?.signedUrl ?? null;
      }
      return {
        id: c.id,
        position: c.position,
        headline: c.headline,
        bodyCopy: c.body_copy,
        durationSeconds: Number(c.duration_seconds),
        imageUrl,
      };
    }),
  );

  // Recent ready library images for the picker.
  const { data: assetRows } = await supabase
    .from("assets")
    .select("id, storage_path, title")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(PICKER_LIMIT);
  const pickerAssets = await Promise.all(
    (assetRows ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("assets")
        .createSignedUrl(a.storage_path, 3600);
      return { id: a.id, title: a.title, url: data?.signedUrl ?? null };
    }),
  );

  // Music library tracks + a signed URL for the selected soundtrack.
  const { data: trackRows } = await supabase
    .from("audio_assets")
    .select("id, title, artist")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const tracks = (trackRows ?? []).map((t) => ({
    id: t.id,
    label: [t.title ?? "Untitled", t.artist].filter(Boolean).join(" — "),
  }));

  let audioUrl: string | null = null;
  if (video.audio_asset_id) {
    const { data: audioRow } = await supabase
      .from("audio_assets")
      .select("storage_path")
      .eq("id", video.audio_asset_id)
      .single();
    if (audioRow) {
      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioRow.storage_path, 3600);
      audioUrl = data?.signedUrl ?? null;
    }
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
          tracks={tracks}
          audioUrl={audioUrl}
          outputUrl={outputUrl}
          downloadUrl={downloadUrl}
          creatomateReady={hasCreatomateKey()}
          notice={notice}
        />
      </main>
    </div>
  );
}
