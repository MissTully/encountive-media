import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  generating: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

interface SlideRow {
  id: string;
  position: number;
  headline: string | null;
  body_copy: string | null;
  render_path: string | null;
  assets: { storage_path: string } | null;
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("content_requests")
    .select("id, topic, brief, target_platform, status")
    .eq("id", requestId)
    .single();
  if (!request) notFound();

  const { data: carousel } = await supabase
    .from("carousels")
    .select("id, status, slide_count")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let slides: Array<SlideRow & { bgUrl: string | null; renderUrl: string | null }> =
    [];
  if (carousel) {
    const { data: slideRows } = await supabase
      .from("slides")
      .select("id, position, headline, body_copy, render_path, assets(storage_path)")
      .eq("carousel_id", carousel.id)
      .order("position", { ascending: true });

    slides = await Promise.all(
      ((slideRows ?? []) as SlideRow[]).map(async (s) => {
        let bgUrl: string | null = null;
        if (s.assets?.storage_path) {
          const { data } = await supabase.storage
            .from("assets")
            .createSignedUrl(s.assets.storage_path, 3600);
          bgUrl = data?.signedUrl ?? null;
        }
        let renderUrl: string | null = null;
        if (s.render_path) {
          const { data } = await supabase.storage
            .from("renders")
            .createSignedUrl(s.render_path, 3600);
          renderUrl = data?.signedUrl ?? null;
        }
        return { ...s, bgUrl, renderUrl };
      }),
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href={`/projects/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back to project
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {request.topic || "Untitled carousel"}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[request.status] ?? STATUS_STYLES.queued
              }`}
            >
              {request.status}
            </span>
          </div>
          {request.target_platform && (
            <span className="text-sm text-zinc-500">
              {request.target_platform}
            </span>
          )}
          {request.brief && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {request.brief}
            </p>
          )}
        </header>

        {slides.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {request.status === "queued"
              ? "Queued — waiting for the generation workflow to write the slides."
              : "No slides yet."}
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {slides.map((s) => (
              <li
                key={s.id}
                className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                  {s.renderUrl || s.bgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(s.renderUrl ?? s.bgUrl) as string}
                      alt={`Slide ${s.position + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      no image
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-widest text-zinc-400">
                    Slide {s.position + 1}
                  </span>
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {s.headline ?? "—"}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {s.body_copy ?? ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
