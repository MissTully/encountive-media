import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { firstParam } from "@/lib/search";
import {
  PLATFORM_LABELS,
  hasLinkedInConfig,
  hasMetaConfig,
  tokenExpired,
  type SocialPlatform,
} from "@/lib/social/config";
import { disconnectAccount } from "./actions";
import { PendingButton } from "@/components/pending-button";

// Always render fresh so connections and post history reflect live state.
export const dynamic = "force-dynamic";

const POST_STATUS_STYLES: Record<string, string> = {
  publishing:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  published:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const notice = firstParam((await searchParams).notice).trim();
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const [{ data: accounts }, { data: posts }] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id, platform, display_name, token_expires_at, created_at")
      .order("platform", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("social_posts")
      .select(
        "id, platform, account_name, status, post_url, error, created_at, videos(title)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const linkedInReady = hasLinkedInConfig();
  const metaReady = hasMetaConfig();

  const providers: Array<{
    key: "linkedin" | "meta";
    title: string;
    blurb: string;
    ready: boolean;
    envHint: string;
    platforms: SocialPlatform[];
  }> = [
    {
      key: "linkedin",
      title: "LinkedIn",
      blurb:
        "Posts videos to the connected member's own profile feed (e.g. linkedin.com/in/melissajotully).",
      ready: linkedInReady,
      envHint: "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET",
      platforms: ["linkedin"],
    },
    {
      key: "meta",
      title: "Facebook & Instagram",
      blurb:
        "One connection adds every Facebook Page you manage and the Instagram professional account linked to each Page. Meta's API can't post to personal profiles.",
      ready: metaReady,
      envHint: "META_APP_ID / META_APP_SECRET",
      platforms: ["facebook", "instagram"],
    },
  ];

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Social accounts
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Connect the destinations your rendered videos publish to. Nothing
            auto-publishes — you pick accounts and hit publish on each video.
          </p>
        </header>

        {notice && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {notice}
          </p>
        )}

        {providers.map((provider) => {
          const rows = (accounts ?? []).filter((a) =>
            (provider.platforms as string[]).includes(a.platform),
          );
          return (
            <section
              key={provider.key}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                    {provider.title}
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {provider.blurb}
                  </p>
                </div>
                {provider.ready ? (
                  <a
                    href={`/social/connect/${provider.key}`}
                    className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    {rows.length > 0 ? "Reconnect" : "Connect"}
                  </a>
                ) : (
                  <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    Needs {provider.envHint}
                  </span>
                )}
              </div>

              {rows.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {rows.map((a) => {
                    const expired = tokenExpired(a.token_expires_at);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-2.5 dark:border-zinc-800"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {a.display_name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {PLATFORM_LABELS[a.platform as SocialPlatform] ??
                              a.platform}
                            {expired
                              ? " · token expired — reconnect"
                              : a.token_expires_at
                                ? ` · token until ${new Date(a.token_expires_at).toLocaleDateString()}`
                                : ""}
                          </span>
                        </div>
                        {expired && (
                          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                            expired
                          </span>
                        )}
                        <form action={disconnectAccount} className="shrink-0">
                          <input type="hidden" name="id" value={a.id} />
                          <PendingButton
                            label="Disconnect"
                            pendingLabel="Removing…"
                            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            pendingClassName="animate-pulse cursor-wait rounded-full border border-zinc-400 bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          />
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Recent publishes
          </h2>
          {(posts ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Nothing published yet. Render a video, then use its Publish page.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(posts ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {(p.videos as { title: string } | null)?.title ?? "Video"}
                      {" → "}
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
          )}
        </section>
      </main>
    </div>
  );
}
