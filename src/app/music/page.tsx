import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteAudioAsset, updateAudioAsset } from "./actions";

// Always render fresh so new uploads and searches reflect live data.
export const dynamic = "force-dynamic";

interface TrackCard {
  id: string;
  storage_path: string;
  title: string | null;
  artist: string | null;
  tags: string[];
  duration_seconds: number | null;
  created_at: string;
  url: string | null;
}

// Strip characters that would break PostgREST's `or` filter syntax.
function sanitize(q: string): string {
  return q.replace(/[,()*\\%]/g, " ").trim();
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function MusicLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const query = ((await searchParams).q ?? "").trim();
  const supabase = await createClient();

  // Keyword search (or no query → everything), newest first.
  let q = supabase
    .from("audio_assets")
    .select("id, storage_path, title, artist, tags, duration_seconds, created_at")
    .order("created_at", { ascending: false });
  if (query) {
    const safe = sanitize(query);
    q = q.or(`title.ilike.%${safe}%,artist.ilike.%${safe}%`);
  }
  const { data: rows } = await q;

  // Private bucket → short-lived signed URLs for the inline players.
  const tracks: TrackCard[] = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data } = await supabase.storage
        .from("audio")
        .createSignedUrl(r.storage_path, 3600);
      return { ...r, tags: r.tags ?? [], url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Music library
            </h1>
          </div>
          <Link
            href="/music/upload"
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Upload
          </Link>
        </header>

        {/* Search — plain GET form, no client JS needed. */}
        <form className="flex flex-col gap-2 sm:flex-row" action="/music">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by title or artist…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Search
          </button>
        </form>

        <p className="text-sm text-zinc-500">
          {query ? (
            <>
              {tracks.length} result{tracks.length === 1 ? "" : "s"} for{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                “{query}”
              </span>
              {" · "}
              <Link href="/music" className="underline">
                clear
              </Link>
            </>
          ) : (
            <>
              {tracks.length} track{tracks.length === 1 ? "" : "s"} in your
              organization.
            </>
          )}
        </p>

        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              {query ? "No matches." : "No music yet."}
            </p>
            {!query && (
              <Link
                href="/music/upload"
                className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Upload your first tracks
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {tracks.map((t) => {
              const duration = formatDuration(t.duration_seconds);
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <form
                      action={updateAudioAsset}
                      className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <input
                        name="title"
                        defaultValue={t.title ?? ""}
                        placeholder="Untitled"
                        aria-label="Track title"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-zinc-900 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none dark:text-zinc-100 dark:hover:border-zinc-800 dark:focus:border-zinc-600"
                      />
                      <input
                        name="artist"
                        defaultValue={t.artist ?? ""}
                        placeholder="Artist"
                        aria-label="Artist"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-zinc-500 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none dark:hover:border-zinc-800 dark:focus:border-zinc-600"
                      />
                      <button
                        type="submit"
                        className="self-start rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 sm:self-auto dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Save
                      </button>
                    </form>
                    <div className="flex shrink-0 items-center gap-2">
                      {duration && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          {duration}
                        </span>
                      )}
                      <form action={deleteAudioAsset}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  {t.url ? (
                    <audio controls preload="none" src={t.url} className="w-full">
                      Your browser can&apos;t play this audio file.
                    </audio>
                  ) : (
                    <span className="text-xs text-zinc-400">no preview</span>
                  )}
                  {t.tags.length > 0 && (
                    <span className="truncate text-[11px] text-zinc-500">
                      {t.tags.slice(0, 6).join(" · ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
