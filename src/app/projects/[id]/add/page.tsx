import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AssetSelector } from "./selector";

export const dynamic = "force-dynamic";

export default async function AddImagesPage({
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

  // Only `ready` assets can be selected (spec: image-select shows ready images).
  const { data: assets } = await supabase
    .from("assets")
    .select("id, title, storage_path")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  // Uploads that haven't finished the analysis workflow yet — surfaced so an
  // empty picker doesn't read as "you have no images".
  const { count: pendingCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .in("status", ["uploaded", "analyzing"]);
  const pending = pendingCount ?? 0;

  // Which assets are already on this board (so we can mark them).
  const { data: existing } = await supabase
    .from("project_assets")
    .select("asset_id")
    .eq("project_id", id);
  const attached = new Set((existing ?? []).map((r) => r.asset_id));

  const items = await Promise.all(
    (assets ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from("assets")
        .createSignedUrl(a.storage_path, 3600);
      return {
        id: a.id,
        title: a.title,
        url: data?.signedUrl ?? null,
        attached: attached.has(a.id),
      };
    }),
  );

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href={`/projects/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← {project.name}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Add images
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Select ready images to add to this project board.
          </p>
        </header>

        {pending > 0 && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            {pending} image{pending === 1 ? "" : "s"}{" "}
            {pending === 1 ? "is" : "are"} still waiting for analysis.
            They&apos;ll appear here once the analysis workflow marks them
            ready.
          </p>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              {pending > 0
                ? "No images are ready to add yet."
                : "No ready images yet — upload some and let the analysis workflow process them first."}
            </p>
            <Link
              href={pending > 0 ? "/library" : "/upload"}
              className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              {pending > 0 ? "View asset library" : "Upload images"}
            </Link>
          </div>
        ) : (
          <AssetSelector projectId={id} assets={items} />
        )}
      </main>
    </div>
  );
}
