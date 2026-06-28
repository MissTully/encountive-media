import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { Uploader } from "./uploader";

export default async function UploadPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Upload images
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Add images to your organization&apos;s library. They&apos;ll be
            auto-titled and made searchable once the analysis workflow runs.
          </p>
        </header>

        <Uploader orgId={ctx.profile.org_id} />

        <footer className="mt-auto text-sm text-zinc-500">
          View uploaded images in the{" "}
          <Link href="/library" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">
            asset library
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
