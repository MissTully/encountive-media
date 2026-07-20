import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasMetaConfig, hasLinkedInConfig, siteUrl } from "@/lib/social/config";
import { firstParam } from "@/lib/search";
import { disconnectSocial } from "./actions";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

const POST_STATUS_STYLES: Record<string, string> = {
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  posting: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  posted: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const notice = firstParam((await searchParams).notice).trim();
  const supabase = await createClient();

  const [{ data: connections }, { data: posts }] = await Promise.all([
    supabase
      .from("social_connections")
      .select("id, provider, account_scope, display_name, status, created_at")
      .order("provider", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("social_posts")
      .select(
        "id, caption, status, external_url, error, created_at, social_connections(display_name, provider)",
      )
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const metaReady = hasMetaConfig();
  const linkedinReady = hasLinkedInConfig();
  const rows = connections ?? [];

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
            Connect the accounts Content Studio can publish to. Once connected,
            approved carousels and rendered videos get a &quot;Share&quot; panel
            with these destinations.
          </p>
        </header>

        {notice && (
          <p className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            {notice}
          </p>
        )}

        {/* Facebook + Instagram — one Meta sign-in covers both. */}
        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Facebook &amp; Instagram
              </h2>
              <p className="text-sm text-zinc-500">
                One Facebook sign-in connects your Facebook Page(s) and any
                Instagram business/creator account linked to them. Meta&apos;s
                API posts to Pages — personal timelines aren&apos;t supported
                by Meta, so personal-feel posts go through your Page.
              </p>
            </div>
            {metaReady ? (
              <a
                href="/api/social/meta/start?scope=company"
                className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Connect
              </a>
            ) : null}
          </div>
          {!metaReady && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <p className="font-medium">Setup needed (one time):</p>
              <ol className="mt-1 list-decimal pl-5">
                <li>
                  Create a Meta app at developers.facebook.com with Facebook
                  Login, and request pages_manage_posts, pages_show_list,
                  instagram_basic, instagram_content_publish.
                </li>
                <li>
                  Add <code className="font-mono">{siteUrl()}/api/social/meta/callback</code>{" "}
                  as a valid OAuth redirect URI.
                </li>
                <li>
                  Set <code className="font-mono">META_APP_ID</code> and{" "}
                  <code className="font-mono">META_APP_SECRET</code> (plus{" "}
                  <code className="font-mono">NEXT_PUBLIC_SITE_URL</code>) in
                  Vercel, then redeploy.
                </li>
              </ol>
            </div>
          )}
          <ConnectionList
            rows={rows.filter(
              (r) => r.provider === "facebook" || r.provider === "instagram",
            )}
          />
        </section>

        {/* LinkedIn — personal and company are separate consents. */}
        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                LinkedIn
              </h2>
              <p className="text-sm text-zinc-500">
                Connect your personal profile (posts as you) and/or the company
                pages you administer (posts as the company).
              </p>
            </div>
            {linkedinReady ? (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <a
                  href="/api/social/linkedin/start?scope=personal"
                  className="rounded-full bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Connect personal
                </a>
                <a
                  href="/api/social/linkedin/start?scope=company"
                  className="rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Connect company
                </a>
              </div>
            ) : null}
          </div>
          {!linkedinReady && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <p className="font-medium">Setup needed (one time):</p>
              <ol className="mt-1 list-decimal pl-5">
                <li>
                  Create a LinkedIn app at developer.linkedin.com and add the
                  &quot;Share on LinkedIn&quot; + &quot;Sign In with
                  LinkedIn&quot; products (Community Management API for company
                  pages).
                </li>
                <li>
                  Add <code className="font-mono">{siteUrl()}/api/social/linkedin/callback</code>{" "}
                  as an authorized redirect URL.
                </li>
                <li>
                  Set <code className="font-mono">LINKEDIN_CLIENT_ID</code> and{" "}
                  <code className="font-mono">LINKEDIN_CLIENT_SECRET</code> in
                  Vercel, then redeploy.
                </li>
              </ol>
            </div>
          )}
          <ConnectionList rows={rows.filter((r) => r.provider === "linkedin")} />
        </section>

        {/* Post history */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Recent posts
          </h2>
          {(posts ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Nothing published yet — share an approved carousel or a rendered
              video and it will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(posts ?? []).map((p) => {
                const conn = p.social_connections as {
                  display_name: string;
                  provider: string;
                } | null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-zinc-800 dark:text-zinc-200">
                        {conn
                          ? `${PROVIDER_LABELS[conn.provider] ?? conn.provider} · ${conn.display_name}`
                          : "Removed account"}
                      </span>
                      <span className="truncate text-xs text-zinc-500">
                        {p.error ?? p.caption ?? ""}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        POST_STATUS_STYLES[p.status] ?? POST_STATUS_STYLES.queued
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.external_url && (
                      <a
                        href={p.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs font-medium underline hover:text-zinc-800 dark:hover:text-zinc-300"
                      >
                        View
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function ConnectionList({
  rows,
}: {
  rows: Array<{
    id: string;
    provider: string;
    account_scope: string;
    display_name: string;
    status: string;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-400">No accounts connected yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
            {PROVIDER_LABELS[r.provider] ?? r.provider} · {r.display_name}
            <span className="text-zinc-400"> ({r.account_scope})</span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              r.status === "connected"
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {r.status}
          </span>
          <form action={disconnectSocial}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="shrink-0 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Disconnect
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
