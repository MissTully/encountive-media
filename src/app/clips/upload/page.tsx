import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ClipUploader } from "./uploader";

export default async function ClipUploadPage() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2">
          <Link
            href="/clips"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Back to video clips
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Upload video clips
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Add b-roll, product footage, and screen recordings to your
            organization&apos;s clip library — then drop them straight into
            video timelines in the editor.
          </p>
        </header>

        <ClipUploader orgId={ctx.profile.org_id} />

        <footer className="mt-auto text-sm text-zinc-500">
          View uploaded clips in the{" "}
          <Link href="/clips" className="underline hover:text-zinc-800 dark:hover:text-zinc-300">
            clip library
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
