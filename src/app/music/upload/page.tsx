import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { MusicUploader } from "./uploader";

export default async function MusicUploadPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/music"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back to music library
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Upload music
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Add tracks to your organization&apos;s music library. Pick one as
            the soundtrack when previewing a carousel as a video.
          </p>
        </header>

        <MusicUploader orgId={ctx.profile.org_id} />

        <footer className="mt-auto text-sm text-zinc-500">
          View uploaded tracks in the{" "}
          <Link href="/music" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">
            music library
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
