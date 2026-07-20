import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createVideo, deleteVideo } from "./actions";

// Always render fresh so statuses reflect live render state.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  rendering: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default async function VideosPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, status, width, height, output_path, created_at, video_clips(count)")
    .order("created_at", { ascending: false });

  const rows = (videos ?? []).map((v) => ({
    ...v,
    clipCount: (v.video_clips as unknown as Array<{ count: number }>)[0]?.count ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Videos
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Assemble marketing videos from your image library and music, preview
            them, then render and download the finished MP4.
          </p>
        </header>

        {/* New video: name it and pick the output format. */}
        <form
          action={createVideo}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row dark:border-zinc-800 dark:bg-zinc-950"
        >
          <input
            name="title"
            placeholder="New video title…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <select
            name="format"
            defaultValue="portrait"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="portrait">Portrait 1080×1350 (feed)</option>
            <option value="reel">Vertical 1080×1920 (reel/story)</option>
            <option value="square">Square 1080×1080</option>
            <option value="landscape">Landscape 1920×1080</option>
          </select>
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Create video
          </button>
        </form>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">No videos yet.</p>
            <p className="text-sm text-zinc-500">
              Create one above, or open an approved carousel and turn it into a
              video with one click.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/videos/${v.id}`}
                    className="truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {v.title}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {v.clipCount} clip{v.clipCount === 1 ? "" : "s"} · {v.width}×
                    {v.height} ·{" "}
                    {new Date(v.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_STYLES[v.status] ?? STATUS_STYLES.draft
                  }`}
                >
                  {v.status}
                </span>
                <Link
                  href={`/videos/${v.id}`}
                  className="shrink-0 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Open editor
                </Link>
                <form action={deleteVideo}>
                  <input type="hidden" name="id" value={v.id} />
                  <button
                    type="submit"
                    className="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
