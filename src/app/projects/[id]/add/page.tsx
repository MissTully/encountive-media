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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
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

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-700">
            <p className="text-zinc-600 dark:text-zinc-400">
              No ready images yet — upload some and let the analysis workflow
              process them first.
            </p>
            <Link
              href="/upload"
              className="text-sm font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              Upload images
            </Link>
          </div>
        ) : (
          <AssetSelector projectId={id} assets={items} />
        )}
      </main>
    </div>
  );
}
