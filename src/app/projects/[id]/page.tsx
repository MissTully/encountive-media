import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/search";
import { PendingButton } from "@/components/pending-button";
import {
  removeAssetFromProject,
  createContentRequest,
  askProjectCreativeDirector,
} from "../actions";

export const dynamic = "force-dynamic";

const REQUEST_STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  generating: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

interface BoardAsset {
  id: string;
  title: string | null;
  storage_path: string;
}

/** Numbered step header — the labels that turn the page into a journey. */
function StepHeading({
  step,
  title,
  detail,
  id,
}: {
  step: string;
  title: string;
  detail: string;
  id?: string;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 items-start gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent-ink">
        {step}
      </span>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="text-sm text-muted">{detail}</p>
      </div>
    </div>
  );
}

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ agent_error?: string | string[] }>;
}) {
  const { id } = await params;
  const agentError = firstParam((await searchParams).agent_error).trim();
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

  const [{ data: requests }, { data: messages }] = await Promise.all([
    supabase
      .from("content_requests")
      .select("id, topic, target_platform, status, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_agent_messages")
      .select("id, role, body, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/projects"
            className="text-sm text-muted transition-colors hover:text-accent"
          >
            ← All projects
          </Link>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
            {project.name}
          </h1>
          <p className="text-muted">
            Your creative journey — four steps from moodboard to approved
            content.
          </p>
        </header>

        {/* ---- Step 1 · Moodboard ---- */}
        <section className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4">
            <StepHeading
              step="1"
              title="Moodboard"
              detail={`Gather the visuals that set this project's direction — ${items.length} image${items.length === 1 ? "" : "s"} so far.`}
            />
            <Link
              href={`/projects/${id}/add`}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:text-ink"
            >
              + Add images
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line py-16 text-center">
              <p className="text-muted">
                The moodboard is empty — every great piece starts with
                references.
              </p>
              <Link
                href={`/projects/${id}/add`}
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Add images from the Image Library
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {items.map((a) => (
                <li
                  key={a.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <div className="relative aspect-square bg-canvas">
                    {a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.url}
                        alt={a.title ?? "Image"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        no preview
                      </div>
                    )}
                    <form
                      action={removeAssetFromProject.bind(null, id, a.id)}
                      className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <button
                        type="submit"
                        title="Remove from moodboard"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                  <div className="px-2.5 py-2">
                    <span className="truncate text-xs text-muted">
                      {a.title ?? "Untitled"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Step 2 · Creative direction ---- */}
        <section className="flex flex-col gap-5">
          <StepHeading
            id="creative-director"
            step="2"
            title="Creative direction"
            detail="Talk to the Creative Director — an AI design agent that knows this moodboard and your brand voice. Ask for concepts, layouts, color and copy direction."
          />

          <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            {(messages ?? []).length === 0 ? (
              <div className="flex flex-col gap-2 px-6 py-10 text-center">
                <span className="font-display text-lg font-semibold text-ink">
                  Meet your Creative Director
                </span>
                <p className="mx-auto max-w-md text-sm leading-6 text-muted">
                  Try: &ldquo;What story should this moodboard tell on
                  Instagram?&rdquo; or &ldquo;Recommend a slide structure and
                  color mood for a product-launch carousel.&rdquo;
                </p>
              </div>
            ) : (
              <ul className="flex max-h-130 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
                {(messages ?? []).map((m) => (
                  <li
                    key={m.id}
                    className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-muted">
                      {m.role === "user" ? "You" : "Creative Director"}
                    </span>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${
                        m.role === "user"
                          ? "rounded-br-sm bg-accent text-white dark:text-ink"
                          : "rounded-bl-sm bg-accent-soft/60 text-ink"
                      }`}
                    >
                      {m.body}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {agentError && (
              <p className="mx-4 mb-3 rounded-lg border border-gold/40 bg-gold-soft px-3 py-2 text-sm text-gold sm:mx-6">
                {agentError}
              </p>
            )}

            <form
              action={askProjectCreativeDirector.bind(null, id)}
              className="flex items-end gap-2 border-t border-line bg-surface-raised p-3 sm:p-4"
            >
              <textarea
                name="question"
                rows={2}
                required
                placeholder="Ask for design direction — concepts, structure, colors, copy angles…"
                className="flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
              />
              <PendingButton
                label="Ask"
                pendingLabel="Thinking…"
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:text-ink"
                pendingClassName="rounded-full bg-accent/60 px-5 py-2.5 text-sm font-medium text-white dark:text-ink"
              />
            </form>
          </div>
        </section>

        {/* ---- Step 3 · Create ---- */}
        <section className="flex flex-col gap-5">
          <StepHeading
            step="3"
            title="Create"
            detail="Brief a carousel — the studio writes on-brand copy and pairs each slide with the right image. Or head to the Video Studio to cut a video."
          />

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <form
              action={createContentRequest.bind(null, id)}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
            >
              <label className="text-xs font-medium uppercase tracking-widest text-muted">
                New carousel brief
              </label>
              <input
                type="text"
                name="topic"
                placeholder="Topic (e.g. 5 tips for faster onboarding)"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
              />
              <textarea
                name="brief"
                rows={3}
                placeholder="Brief — what should this carousel say, and to whom?"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
              />
              <div className="flex items-center justify-between gap-3">
                <select
                  name="target_platform"
                  defaultValue="instagram"
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="facebook">Facebook</option>
                  <option value="twitter">X / Twitter</option>
                </select>
                <PendingButton
                  label="Queue carousel"
                  pendingLabel="Queueing…"
                  className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:text-ink"
                  pendingClassName="rounded-full bg-accent/60 px-5 py-2 text-sm font-medium text-white dark:text-ink"
                />
              </div>
            </form>

            <Link
              href="/videos"
              className="flex flex-col justify-center gap-1.5 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/60"
            >
              <span className="text-xs font-medium uppercase tracking-widest text-muted">
                Making a video instead?
              </span>
              <span className="font-display text-lg font-semibold text-ink">
                Open the Video Studio →
              </span>
              <span className="text-sm leading-6 text-muted">
                Assemble moodboard images and music into an MP4.
              </span>
            </Link>
          </div>
        </section>

        {/* ---- Step 4 · Review & approve ---- */}
        <section className="flex flex-col gap-5 pb-8">
          <StepHeading
            step="4"
            title="Review & approve"
            detail="Open a carousel to preview it slide by slide, leave comments, request changes, and give the final approval."
          />

          {requests && requests.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/projects/${id}/requests/${r.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/60"
                  >
                    <span className="truncate text-sm text-ink">
                      {r.topic || "Untitled carousel"}
                      {r.target_platform ? (
                        <span className="text-muted"> · {r.target_platform}</span>
                      ) : null}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        REQUEST_STATUS_STYLES[r.status] ??
                        REQUEST_STATUS_STYLES.queued
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">
              Nothing to review yet — queue your first carousel in step 3.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
