import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/env";
import { signOut } from "@/app/auth/actions";

const PHASES = [
  {
    title: "Scaffold & auth",
    detail: "Next.js + Tailwind + Supabase; Google sign-in with auto profiles.",
    done: true,
  },
  {
    title: "Database schema",
    detail: "Tables, pgvector, RLS policies, and the match_assets function.",
    done: true,
  },
  {
    title: "Bulk upload",
    detail: "Upload many images to the assets bucket with a row per file.",
    done: true,
  },
  {
    title: "Vision titling + embeddings",
    detail: "Gemini writes title, description, tags; embed for semantic search.",
    done: true,
  },
  {
    title: "Asset library",
    detail: "Keyword + semantic search over the org-wide image library.",
    done: true,
  },
  {
    title: "Projects & boards",
    detail: "Multi-select images onto project boards.",
    done: true,
  },
  {
    title: "Carousel generation",
    detail: "Reuse-aware copy + image pipeline, rendered via Creatomate.",
    done: true,
  },
  {
    title: "Review & approval",
    detail: "Human approves each carousel before it can be published.",
    done: true,
  },
];

export default async function Home() {
  const configured = hasSupabaseConfig();

  // When configured, the proxy guarantees a signed-in user here. Look up their
  // email and organization for the header.
  let email: string | null = null;
  let orgName: string | null = null;
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organizations(name)")
        .eq("id", user.id)
        .single();
      orgName = profile?.organizations?.name ?? null;
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Encountive{orgName ? ` · ${orgName}` : ""}
            </span>
            {email && (
              <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="hidden sm:inline">{email}</span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Content Studio
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Generate on-brand social-media carousels: a reuse-aware image
            library, AI-written copy, and editable text rendered over clean
            visuals. Built multi-tenant from day one.
          </p>
          {email && (
            <nav className="flex gap-3">
              <Link
                href="/upload"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Upload images
              </Link>
              <Link
                href="/library"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Asset library
              </Link>
              <Link
                href="/music"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Music library
              </Link>
              <Link
                href="/projects"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Projects
              </Link>
              <Link
                href="/brand"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Brand kit
              </Link>
            </nav>
          )}
        </header>

        <section
          className={`rounded-lg border px-4 py-3 text-sm ${
            configured
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {configured ? (
            <>Supabase environment detected — you&apos;re ready to wire up data.</>
          ) : (
            <>
              No Supabase config yet. Copy{" "}
              <code className="font-mono">.env.example</code> to{" "}
              <code className="font-mono">.env.local</code> and add your project
              URL and anon key.
            </>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Build roadmap
          </h2>
          <ol className="flex flex-col gap-2">
            {PHASES.map((phase, i) => (
              <li
                key={phase.title}
                className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    phase.done
                      ? "bg-green-600 text-white"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {phase.done ? "✓" : i + 1}
                </span>
                <div className="flex flex-col">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {phase.title}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {phase.detail}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-auto text-sm text-zinc-500">
          See{" "}
          <code className="font-mono">
            docs/encountive-content-studio-build-spec.md
          </code>{" "}
          for the full build specification.
        </footer>
      </main>
    </div>
  );
}
