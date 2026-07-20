import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/search";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

// Carousel workflow states, in pipeline order — used for both the filter chips
// and the per-project status badges.
const REQUEST_STATUSES = ["queued", "generating", "in_review", "approved"] as const;

const STATUS_BADGE_STYLES: Record<string, string> = {
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  generating: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const statusFilter = firstParam((await searchParams).status).trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, created_at, project_assets(count), content_requests(status)")
    .order("created_at", { ascending: false });

  const rows = (projects ?? []).map((p) => {
    const counts: Record<string, number> = {};
    for (const r of p.content_requests ?? []) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return { ...p, counts };
  });

  // A status chip narrows the list to projects with at least one carousel in
  // that state — e.g. "in_review" is the to-review queue across all projects.
  const filtered = REQUEST_STATUSES.includes(
    statusFilter as (typeof REQUEST_STATUSES)[number],
  )
    ? rows.filter((p) => (p.counts[statusFilter] ?? 0) > 0)
    : rows;

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

        <nav className="flex flex-wrap gap-2">
          <Link
            href="/projects"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !REQUEST_STATUSES.includes(
                statusFilter as (typeof REQUEST_STATUSES)[number],
              )
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            All
          </Link>
          {REQUEST_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/projects?status=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                statusFilter === s
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {s.replace("_", " ")}
            </Link>
          ))}
        </nav>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {rows.length === 0
              ? "No projects yet. Create your first one above."
              : `No projects have a ${statusFilter.replace("_", " ")} carousel.`}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((p) => {
              const count = p.project_assets?.[0]?.count ?? 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                  >
                    <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {p.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {REQUEST_STATUSES.filter((s) => p.counts[s]).map((s) => (
                        <span
                          key={s}
                          title={`${p.counts[s]} ${s.replace("_", " ")}`}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE_STYLES[s]}`}
                        >
                          {p.counts[s]} {s.replace("_", " ")}
                        </span>
                      ))}
                      <span className="text-sm text-zinc-500">
                        {count} image{count === 1 ? "" : "s"}
                      </span>
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
