import Link from "next/link";
import Image from "next/image";
import { getProfile } from "@/lib/auth";
import { hasSupabaseConfig } from "@/lib/env";
import { signOut } from "@/app/auth/actions";
import { NavLinks } from "./nav-links";

/**
 * App-wide navigation shell. Renders nothing for signed-out visitors so the
 * intro and login pages stay clean; once signed in, every page shares the
 * same clearly-labelled navigation.
 */
export async function SiteNav() {
  if (!hasSupabaseConfig()) return null;
  const ctx = await getProfile();
  if (!ctx) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Encountive Media logo"
              width={32}
              height={32}
              priority
            />
            <span className="font-display text-lg font-semibold tracking-tight text-ink">
              Encountive
            </span>
            <span className="font-display text-lg font-light italic text-accent">
              Media
            </span>
          </Link>
          <NavLinks />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden max-w-45 truncate text-xs text-muted md:inline">
            {ctx.user.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
