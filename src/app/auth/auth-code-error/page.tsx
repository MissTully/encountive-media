import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center font-sans">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Sign-in failed
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        We couldn&apos;t complete the sign-in. The link may have expired or the
        Google provider may not be fully configured yet.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Try again
      </Link>
    </div>
  );
}
