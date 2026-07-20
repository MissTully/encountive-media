import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addSocialAccount, removeSocialAccount } from "./actions";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

// What to paste per platform, shown under the connect form. Each destination
// needs the platform-side identity to post as, plus a long-lived token created
// in that platform's developer console (one-time setup outside the app).
const SETUP_NOTES: Array<{ platform: string; idLabel: string; note: string }> = [
  {
    platform: "Instagram",
    idLabel: "IG business account id",
    note: "Meta app with instagram_content_publish; the account must be a Business/Creator account linked to a Facebook Page. Use a long-lived Page-linked user or system-user token.",
  },
  {
    platform: "Facebook",
    idLabel: "Page id",
    note: "Meta app with pages_manage_posts; paste a long-lived Page access token for the Page you post as.",
  },
  {
    platform: "LinkedIn",
    idLabel: "Author URN (urn:li:organization:…)",
    note: "LinkedIn app with the Community Management API (w_organization_social). Paste the full organization URN and a member token authorized for that org.",
  },
];

export default async function ConnectionsPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: accountRows } = await supabase
    .from("social_accounts")
    .select("id, platform, display_name, external_id, created_at")
    .order("created_at", { ascending: true });
  const accounts = accountRows ?? [];

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Connections
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Where approved carousels can be published. Connect the accounts the
            studio posts as — publishing stays a human decision on each
            carousel&apos;s review screen.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connected accounts
          </h2>
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              Nothing connected yet — add your first destination below.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {a.display_name}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {PLATFORM_LABELS[a.platform] ?? a.platform} ·{" "}
                      {a.external_id}
                    </span>
                  </div>
                  <form action={removeSocialAccount.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Disconnect
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connect an account
          </h2>
          <form action={addSocialAccount} className="flex flex-col gap-5">
            <Field label="Platform">
              <select name="platform" className={inputClass} defaultValue="instagram">
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </Field>
            <Field label="Display name" hint="How this destination appears in publish menus.">
              <input
                name="account_name"
                required
                placeholder="Encountive on Instagram"
                className={inputClass}
              />
            </Field>
            <Field
              label="Account id / URN"
              hint="IG business account id, Facebook Page id, or LinkedIn author URN."
            >
              <input
                name="account_ref"
                required
                placeholder="17841400000000000 · 103…456 · urn:li:organization:12345"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field
              label="Access token"
              hint="A long-lived token from the platform's developer console. Re-add the account to rotate it."
            >
              <input
                name="access_token"
                type="password"
                required
                placeholder="Paste token"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <div>
              <button
                type="submit"
                className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Connect
              </button>
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            One-time platform setup
          </h2>
          <ul className="flex flex-col gap-2">
            {SETUP_NOTES.map((n) => (
              <li
                key={n.platform}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {n.platform}
                </span>{" "}
                <span className="text-zinc-500">({n.idLabel})</span>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
