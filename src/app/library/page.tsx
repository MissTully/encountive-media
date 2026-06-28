import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Always render fresh so newly-uploaded images appear immediately.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  analyzing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

export default async function LibraryPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: assets } = await supabase
    .from("assets")
    .select("id, storage_path, title, status, source, created_at")
    .order("created_at", { ascending: false });

  // Buckets are private — generate short-lived signed URLs for thumbnails.
  const items = await Promise.all(
    (assets ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("assets")
        .createSignedUrl(a.storage_path, 3600);
      return { ...a, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
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
            <p className="text-zinc-600 dark:text-zinc-400">
              {items.length} image{items.length === 1 ? "" : "s"} in your
              organization.
            </p>
          </div>
          <Link
            href="/upload"
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Upload
          </Link>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              No images yet.
            </p>
            <Link
              href="/upload"
              className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              Upload your first images
            </Link>
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
                </div>
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                    {a.title ?? "Untitled"}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      STATUS_STYLES[a.status] ?? STATUS_STYLES.uploaded
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
