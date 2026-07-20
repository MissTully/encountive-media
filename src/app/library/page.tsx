import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { embedText, hasGeminiKey } from "@/lib/embeddings";
import { firstParam, sanitizeSearch } from "@/lib/search";
import {
  analyzePendingAssets,
  resetStuckAssets,
  renameAsset,
  deleteAsset,
} from "./actions";

// Always render fresh so newly-processed images and searches reflect live data.
export const dynamic = "force-dynamic";
// Analyzing a batch of images (vision + embedding per image) takes longer than
// the default serverless window.
export const maxDuration = 60;

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  analyzing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

interface AssetCard {
  id: string;
  storage_path: string;
  title: string | null;
  description: string | null;
  tags: string[];
  status: string | null;
  similarity: number | null;
  url: string | null;
  downloadUrl: string | null;
}

/** Filesystem-safe download name: the asset title + its stored extension. */
function downloadFilename(title: string | null, storagePath: string): string {
  const ext = storagePath.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  const base =
    (title ?? "")
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "image";
  return `${base}${ext}`;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    mode?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");
  const orgId = ctx.profile.org_id;

  const sp = await searchParams;
  const query = firstParam(sp.q).trim();
  const mode = firstParam(sp.mode) === "semantic" ? "semantic" : "keyword";
  const notice = firstParam(sp.notice).trim();
  const geminiReady = hasGeminiKey();

  const supabase = await createClient();

  // Pipeline health: how many images still need vision analysis + embedding.
  const [{ count: pendingCount }, { count: stuckCount }] = await Promise.all([
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "uploaded"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "analyzing"),
  ]);

  let rows: Omit<AssetCard, "url" | "downloadUrl">[] = [];
  let searchError: string | null = null;

  if (query && mode === "semantic") {
    // Semantic search: embed the query, then rank assets by cosine similarity
    // via the match_assets() function. Only `ready` assets are returned.
    if (!geminiReady) {
      searchError =
        "Semantic search needs GOOGLE_GEMINI_API_KEY configured. Try keyword search instead.";
    } else {
      try {
        const embedding = await embedText(query);
        const { data, error } = await supabase.rpc("match_assets", {
          query_embedding: JSON.stringify(embedding),
          p_org_id: orgId,
          match_threshold: 0.3,
          match_count: 48,
        });
        if (error) throw error;
        rows = (data ?? []).map((r) => ({
          id: r.id,
          storage_path: r.storage_path,
          title: r.title,
          description: r.description,
          tags: r.tags ?? [],
          status: "ready",
          similarity: r.similarity,
        }));
      } catch (e) {
        searchError =
          e instanceof Error ? e.message : "Semantic search failed.";
      }
    }
  } else {
    // Keyword search (or no query → everything), newest first.
    let q = supabase
      .from("assets")
      .select("id, storage_path, title, description, tags, status")
      .order("created_at", { ascending: false });
    if (query) {
      const safe = sanitizeSearch(query);
      q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    const { data } = await q;
    rows = (data ?? []).map((r) => ({
      id: r.id,
      storage_path: r.storage_path,
      title: r.title,
      description: r.description,
      tags: r.tags ?? [],
      status: r.status,
      similarity: null,
    }));
  }

  // Private buckets → short-lived signed URLs: one to view the thumbnail, one
  // with a Content-Disposition filename so "Download" saves the original file.
  const items: AssetCard[] = await Promise.all(
    rows.map(async (r) => {
      const [{ data: view }, { data: dl }] = await Promise.all([
        supabase.storage.from("assets").createSignedUrl(r.storage_path, 3600),
        supabase.storage.from("assets").createSignedUrl(r.storage_path, 3600, {
          download: downloadFilename(r.title, r.storage_path),
        }),
      ]);
      return {
        ...r,
        url: view?.signedUrl ?? null,
        downloadUrl: dl?.signedUrl ?? null,
      };
    }),
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Asset library
            </h1>
          </div>
          <Link
            href="/upload"
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Upload
          </Link>
        </header>

        {/* Search — plain GET form, no client JS needed. */}
        <form className="flex flex-col gap-2 sm:flex-row" action="/library">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by keyword or meaning…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <select
            name="mode"
            defaultValue={mode}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="keyword">Keyword</option>
            <option value="semantic">Semantic (AI)</option>
          </select>
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
              {items.length} result{items.length === 1 ? "" : "s"} for{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                “{query}”
              </span>{" "}
              ({mode === "semantic" ? "semantic" : "keyword"})
              {query && (
                <>
                  {" · "}
                  <Link href="/library" className="underline">
                    clear
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              {items.length} image{items.length === 1 ? "" : "s"} in your
              organization.
            </>
          )}
        </p>

        {notice && (
          <p className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            {notice}
          </p>
        )}

        {((pendingCount ?? 0) > 0 || (stuckCount ?? 0) > 0) && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950">
            <span className="flex-1 text-sm text-amber-900 dark:text-amber-300">
              {pendingCount ?? 0} image{(pendingCount ?? 0) === 1 ? "" : "s"}{" "}
              waiting for analysis
              {(stuckCount ?? 0) > 0 && (
                <>
                  {" · "}
                  {stuckCount} stuck mid-analysis
                </>
              )}
              . The n8n workflow processes these on a schedule, or run a batch
              now.
            </span>
            <div className="flex shrink-0 gap-2">
              {(stuckCount ?? 0) > 0 && (
                <form action={resetStuckAssets}>
                  <button
                    type="submit"
                    className="rounded-full border border-amber-400 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-zinc-800"
                  >
                    Reset {stuckCount} stuck
                  </button>
                </form>
              )}
              {(pendingCount ?? 0) > 0 && (
                <form action={analyzePendingAssets}>
                  <button
                    type="submit"
                    className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Analyze next batch
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {searchError && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            {searchError}
          </p>
        )}

        {items.length === 0 && !searchError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              {query ? "No matches." : "No images yet."}
            </p>
            {!query && (
              <Link
                href="/upload"
                className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Upload your first images
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.title ?? "Uploaded image"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      no preview
                    </div>
                  )}
                  {a.similarity !== null && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                      {Math.round(a.similarity * 100)}% match
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    {/* Inline rename: edit the title in place, ✓ to save. */}
                    <form
                      action={renameAsset.bind(null, a.id)}
                      className="flex min-w-0 flex-1 items-center gap-1"
                    >
                      <input
                        type="text"
                        name="title"
                        required
                        defaultValue={a.title ?? ""}
                        placeholder="Untitled"
                        className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-zinc-800 outline-none hover:border-zinc-200 focus:border-zinc-400 focus:bg-white dark:text-zinc-200 dark:hover:border-zinc-800 dark:focus:border-zinc-600 dark:focus:bg-zinc-950"
                      />
                      <button
                        type="submit"
                        title="Save name"
                        className="shrink-0 rounded px-1 text-xs text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        ✓
                      </button>
                    </form>
                    {a.status && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_STYLES[a.status] ?? STATUS_STYLES.uploaded
                        }`}
                      >
                        {a.status}
                      </span>
                    )}
                  </div>
                  {a.tags.length > 0 && (
                    <span className="truncate text-[11px] text-zinc-500">
                      {a.tags.slice(0, 4).join(" · ")}
                    </span>
                  )}
                  <div className="flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-900">
                    {a.downloadUrl ? (
                      <a
                        href={a.downloadUrl}
                        className="text-[11px] font-medium text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
                      >
                        ⬇ Download
                      </a>
                    ) : (
                      <span />
                    )}
                    <form action={deleteAsset.bind(null, a.id)}>
                      <button
                        type="submit"
                        title="Delete from library (removes it from project boards too)"
                        className="text-[11px] font-medium text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
