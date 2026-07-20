import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/env";

// The creative journey, in order — each step links straight to where it
// happens so the home page doubles as a guided map of the studio.
const JOURNEY = [
  {
    step: "01",
    title: "Start a project",
    detail:
      "Give your campaign a home. Every project carries its own moodboard, briefs, and finished content.",
    href: "/projects",
    label: "Open Projects",
  },
  {
    step: "02",
    title: "Gather your visuals & sound",
    detail:
      "Pull images from the shared library — every upload is auto-titled and searchable — and pick a soundtrack from the music library.",
    href: "/library",
    label: "Browse the Image Library",
  },
  {
    step: "03",
    title: "Consult the Creative Director",
    detail:
      "An AI design agent inside every project. Ask for art direction, slide structure, color and typography guidance — it knows your board and your brand voice.",
    href: "/projects",
    label: "Ask inside a project",
  },
  {
    step: "04",
    title: "Create carousels & videos",
    detail:
      "Brief a carousel and let the studio write on-brand copy and pick or generate imagery. Assemble clips and music into a marketing video.",
    href: "/videos",
    label: "Open the Video Studio",
  },
  {
    step: "05",
    title: "Review, approve, publish",
    detail:
      "Nothing ships without your eyes on it. Comment on individual slides, request changes, then approve and download the finished piece.",
    href: "/projects?status=in_review",
    label: "See what's in review",
  },
];

const TOOLS = [
  {
    title: "Projects",
    detail: "Campaign boards, briefs, and the Creative Director agent.",
    href: "/projects",
  },
  {
    title: "Image Library",
    detail: "Searchable, reuse-aware visuals for the whole team.",
    href: "/library",
  },
  {
    title: "Music Library",
    detail: "Soundtracks for your videos, managed like your images.",
    href: "/music",
  },
  {
    title: "Video Studio",
    detail: "Assemble clips and music; render downloadable MP4s.",
    href: "/videos",
  },
  {
    title: "Brand Kit",
    detail: "Voice guidelines that keep every word on-brand.",
    href: "/brand",
  },
  {
    title: "Upload Images",
    detail: "Drop in new visuals — titled and tagged automatically.",
    href: "/upload",
  },
];

export default async function Home() {
  const configured = hasSupabaseConfig();

  let signedIn = false;
  let firstName: string | null = null;
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      firstName = profile?.full_name?.split(" ")[0] ?? null;
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-20 px-6 py-16 sm:px-10 sm:py-20">
        {/* ---- Introduction ---- */}
        <header className="flex flex-col items-center gap-6 text-center">
          <span className="rounded-full border border-line bg-surface px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Encountive Inc · Department of Sales &amp; Marketing
          </span>
          <Image
            src="/logo.svg"
            alt="Encountive Media logo"
            width={80}
            height={80}
            priority
          />
          <h1 className="font-display text-5xl font-semibold tracking-tight text-ink sm:text-7xl">
            Encountive{" "}
            <span className="font-light italic text-accent">Media</span>
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
            Your social media marketing agent. From the first spark of an idea
            to an approved, ready-to-publish carousel or video — one elegant
            creative journey, guided at every step.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {signedIn ? (
              <>
                <Link
                  href="/projects"
                  className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-strong dark:text-ink"
                >
                  {firstName
                    ? `Continue your journey, ${firstName}`
                    : "Continue your journey"}
                </Link>
                <Link
                  href="/library"
                  className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Browse the library
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-strong dark:text-ink"
              >
                Sign in to begin
              </Link>
            )}
          </div>
        </header>

        {!configured && (
          <section className="rounded-xl border border-gold/40 bg-gold-soft px-4 py-3 text-sm text-gold">
            No Supabase config yet. Copy{" "}
            <code className="font-mono">.env.example</code> to{" "}
            <code className="font-mono">.env.local</code> and add your project
            URL and anon key.
          </section>
        )}

        {/* ---- The creative journey ---- */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 text-center">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
              How it works
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              The creative journey
            </h2>
          </div>
          <ol className="flex flex-col gap-3">
            {JOURNEY.map((s) => (
              <li
                key={s.step}
                className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-accent/50 sm:flex-row sm:items-center sm:gap-6"
              >
                <span className="font-display text-3xl font-light italic text-accent/70">
                  {s.step}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="font-display text-xl font-semibold text-ink">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-6 text-muted">{s.detail}</p>
                </div>
                {signedIn && (
                  <Link
                    href={s.href}
                    className="shrink-0 self-start rounded-full border border-line px-4 py-2 text-xs font-medium text-muted transition-colors group-hover:border-accent group-hover:text-accent sm:self-center"
                  >
                    {s.label} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Studio map ---- */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 text-center">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
              The studio
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Everything, clearly labelled
            </h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <li key={t.title}>
                <Link
                  href={signedIn ? t.href : "/login"}
                  className="flex h-full flex-col gap-1.5 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/60"
                >
                  <span className="font-display text-lg font-semibold text-ink">
                    {t.title}
                  </span>
                  <span className="text-sm leading-6 text-muted">
                    {t.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-auto border-t border-line pt-6 text-center text-xs text-muted">
          Encountive Media — the in-house creative studio of Encountive Inc,
          Department of Sales &amp; Marketing.
        </footer>
      </main>
    </div>
  );
}
