import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { removeAssetFromProject } from "../actions";

export const dynamic = "force-dynamic";

interface BoardAsset {
  id: string;
  title: string | null;
  storage_path: string;
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!project) notFound();

  const { data: boardRows } = await supabase
    .from("project_assets")
    .select("position, assets(id, title, storage_path)")
    .eq("project_id", id)
    .order("position", { ascending: true });

  const board = (boardRows ?? [])
    .map((r) => r.assets as BoardAsset | null)
    .filter((a): a is BoardAsset => Boolean(a));

  const items = await Promise.all(
    board.map(async (a) => {
      const { data } = await supabase.storage
        .from("assets")
        .createSignedUrl(a.storage_path, 3600);
      return { ...a, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/projects"
              className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Projects
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {project.name}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              {items.length} image{items.length === 1 ? "" : "s"} on this board.
            </p>
          </div>
          <Link
            href={`/projects/${id}/add`}
            className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Add images
          </Link>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              This board is empty.
            </p>
            <Link
              href={`/projects/${id}/add`}
              className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              Add images from the library
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((a) => (
              <li
                key={a.id}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.title ?? "Image"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      no preview
                    </div>
                  )}
                  <form
                    action={removeAssetFromProject.bind(null, id, a.id)}
                    className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <button
                      type="submit"
                      title="Remove from board"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </form>
                </div>
                <div className="px-2.5 py-2">
                  <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                    {a.title ?? "Untitled"}
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
