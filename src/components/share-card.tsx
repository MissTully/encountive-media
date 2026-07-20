import Link from "next/link";

export interface ShareConnection {
  id: string;
  provider: string;
  display_name: string;
  account_scope: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

/**
 * "Post to social" panel used by the video editor and the carousel review
 * page. `action` is the bound server action that performs the publish;
 * `ready` gates the button (e.g. the MP4 must be rendered first).
 */
export function ShareCard({
  action,
  connections,
  ready,
  readyHint,
}: {
  action: (formData: FormData) => Promise<void>;
  connections: ShareConnection[];
  ready: boolean;
  readyHint: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Share to social
        </h2>
        <p className="text-sm text-zinc-500">
          Publish straight to your connected accounts. Every attempt is logged
          on the{" "}
          <Link href="/social" className="underline">
            social page
          </Link>
          .
        </p>
      </div>

      {connections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700">
          No social accounts connected yet —{" "}
          <Link href="/social" className="underline">
            connect Facebook, Instagram, or LinkedIn
          </Link>{" "}
          first.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {connections.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  name="connections"
                  value={c.id}
                  className="h-4 w-4"
                />
                <span className="truncate">
                  {PROVIDER_LABELS[c.provider] ?? c.provider} · {c.display_name}
                  <span className="text-zinc-400"> ({c.account_scope})</span>
                </span>
              </label>
            ))}
          </div>
          <textarea
            name="caption"
            rows={3}
            placeholder="Caption for the post…"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!ready}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Post now
            </button>
            {!ready && <span className="text-sm text-zinc-500">{readyHint}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
