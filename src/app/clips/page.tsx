import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/format";
import { firstParam, sanitizeSearch } from "@/lib/search";
import { deleteVideoAsset, updateVideoAsset } from "./actions";

// Always render fresh so new uploads and searches reflect live data.
export const dynamic = "force-dynamic";

export default async function ClipLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const query = firstParam((await searchParams).q).trim();
  const supabase = await createClient();

  let q = supabase
    .from("video_assets")
    .select("id, storage_path, title, tags, duration_seconds, width, height, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (query) {
    q = q.ilike("title", `%${sanitizeSearch(query)}%`);
  }
  const { data: rows } = await q;

  // Private bucket → signed URLs for the inline players, one batch call.
  const { data: signed } = rows?.length
    ? await supabase.storage
        .from("clips")
        .createSignedUrls(rows.map((r) => r.storage_path), 3600)
    : { data: [] };
  const clips = (rows ?? []).map((r, i) => ({
    ...r,
    url: signed?.[i]?.signedUrl ?? null,
  }));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Video clips
            </h1>
          </div>
          <Link
            href="/clips/upload"
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Upload
          </Link>
        </header>

        <form className="flex flex-col gap-2 sm:flex-row" action="/clips">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search clips by title…"
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
              {clips.length} result{clips.length === 1 ? "" : "s"} for{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                “{query}”
              </span>
              {" · "}
              <Link href="/clips" className="underline">
                clear
              </Link>
            </>
          ) : (
            <>
              {clips.length} clip{clips.length === 1 ? "" : "s"} in your
              organization.
            </>
          )}
        </p>

        {clips.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              {query ? "No matches." : "No video clips yet."}
            </p>
            {!query && (
              <Link
                href="/clips/upload"
                className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Upload your first clips
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {clips.map((c) => {
              const duration = formatDuration(c.duration_seconds);
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {c.url ? (
                    <video
                      controls
                      preload="metadata"
                      src={c.url}
                      className="aspect-video w-full rounded-lg bg-black object-contain"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-900">
                      no preview
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <form
                      action={updateVideoAsset}
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                    >
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        name="title"
                        defaultValue={c.title ?? ""}
                        placeholder="Untitled clip"
                        aria-label="Clip title"
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-zinc-900 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none dark:text-zinc-100 dark:hover:border-zinc-800 dark:focus:border-zinc-600"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Save
                      </button>
                    </form>
                    {duration && (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                        {duration}
                      </span>
                    )}
                    <form action={deleteVideoAsset}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
