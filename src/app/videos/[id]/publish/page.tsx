import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/search";
import {
  PLATFORM_LABELS,
  tokenExpired,
  type SocialPlatform,
} from "@/lib/social/config";
import { publishVideo } from "../../actions";
import { PendingButton } from "@/components/pending-button";

// Always render fresh so account state and post history are live.
export const dynamic = "force-dynamic";
// Publishing runs in-request: LinkedIn uploads the MP4 bytes and Instagram
// polls server-side processing — budget minutes, like rendering does.
export const maxDuration = 300;

const POST_STATUS_STYLES: Record<string, string> = {
  publishing:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  published:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function PublishVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { id } = await params;
  const notice = firstParam((await searchParams).notice).trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const [{ data: video }, { data: accounts }, { data: posts }] =
    await Promise.all([
      supabase
        .from("videos")
        .select("id, title, status, width, height, output_path")
        .eq("id", id)
        .single(),
      supabase
        .from("social_accounts")
        .select("id, platform, display_name, token_expires_at")
        .order("platform", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("social_posts")
        .select(
          "id, platform, account_name, status, post_url, error, created_at",
        )
        .eq("video_id", id)
        .order("created_at", { ascending: false }),
    ]);
  if (!video) notFound();

  const ready = video.status === "ready" && Boolean(video.output_path);
  const publishWithId = publishVideo.bind(null, video.id);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href={`/videos/${video.id}`}
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back to editor
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Publish “{video.title}”
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Send the rendered {video.width}×{video.height} MP4 to your connected
            accounts. Each destination is attempted independently.
          </p>
        </header>

        {notice && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {notice}
          </p>
        )}

        {!ready ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This video hasn&apos;t been rendered yet — publish needs the
              finished MP4.
            </p>
            <Link
              href={`/videos/${video.id}`}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Open the editor to render it
            </Link>
          </div>
        ) : (accounts ?? []).length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No social accounts connected yet.
            </p>
            <Link
              href="/social"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Connect accounts
            </Link>
          </div>
        ) : (
          <form
            action={publishWithId}
            className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Destinations
              </legend>
              {(accounts ?? []).map((a) => {
                const expired = tokenExpired(a.token_expires_at);
                return (
                  <label
                    key={a.id}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${
                      expired
                        ? "cursor-not-allowed border-zinc-200 opacity-50 dark:border-zinc-800"
                        : "cursor-pointer border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="account_id"
                      value={a.id}
                      disabled={Boolean(expired)}
                      className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                        {a.display_name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {PLATFORM_LABELS[a.platform as SocialPlatform] ??
                          a.platform}
                        {expired ? " · token expired — reconnect on Social accounts" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Caption
              </span>
              <textarea
                name="caption"
                rows={4}
                defaultValue={video.title}
                placeholder="What should the post say?"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <PendingButton
              label="Publish now"
              pendingLabel="Publishing… (uploads + processing can take minutes)"
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              pendingClassName="animate-pulse cursor-wait rounded-full bg-zinc-600 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-400 dark:text-zinc-900"
            />
          </form>
        )}

        {(posts ?? []).length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Publish history
            </h2>
            <ul className="flex flex-col gap-2">
              {(posts ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {p.account_name}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {PLATFORM_LABELS[p.platform as SocialPlatform] ?? p.platform}
                      {" · "}
                      {new Date(p.created_at).toLocaleString()}
                      {p.status === "error" && p.error ? ` · ${p.error}` : ""}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      POST_STATUS_STYLES[p.status] ?? POST_STATUS_STYLES.publishing
                    }`}
                  >
                    {p.status}
                  </span>
                  {p.post_url && p.status === "published" && (
                    <a
                      href={p.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      View post
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
