import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, created_at, project_assets(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Projects
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Each project has a board of selected images used for carousel
            generation.
          </p>
        </header>

        <form action={createProject} className="flex gap-2">
          <input
            type="text"
            name="name"
            required
            placeholder="New project name…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Create
          </button>
        </form>

        {!projects || projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No projects yet. Create your first one above.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((p) => {
              const count = p.project_assets?.[0]?.count ?? 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.name}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {count} image{count === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
