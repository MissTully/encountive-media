import { hasSupabaseConfig } from "@/lib/env";

const PHASES = [
  {
    title: "Scaffold & auth",
    detail: "Next.js + Tailwind + Supabase client; seed one org and profile.",
    done: true,
  },
  {
    title: "Database schema",
    detail: "Tables, pgvector, RLS policies, and the match_assets function.",
  },
  {
    title: "Bulk upload",
    detail: "Upload many images to the assets bucket with a row per file.",
  },
  {
    title: "Vision titling + embeddings",
    detail: "Gemini writes title, description, tags; embed for semantic search.",
  },
  {
    title: "Asset library",
    detail: "Keyword + semantic search over the org-wide image library.",
  },
  {
    title: "Projects & boards",
    detail: "Multi-select images onto project boards.",
  },
  {
    title: "Carousel generation",
    detail: "Reuse-aware copy + image pipeline, rendered via Creatomate.",
  },
  {
    title: "Review & approval",
    detail: "Human approves each carousel before it can be published.",
  },
];

export default function Home() {
  const configured = hasSupabaseConfig();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Encountive
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Content Studio
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Generate on-brand social-media carousels: a reuse-aware image
            library, AI-written copy, and editable text rendered over clean
            visuals. Built multi-tenant from day one.
          </p>
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
