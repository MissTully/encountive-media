"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ItemStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  file: File;
  status: ItemStatus;
  error?: string;
}

export function fileExt(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
}

/**
 * Shared multi-file uploader UI used by the image and music libraries. The
 * caller supplies `upload`, which pushes one file to storage + inserts its
 * row (rolling back on failure) and resolves to an error message or null.
 */
export function Uploader({
  accept,
  chooseLabel,
  hint,
  upload,
}: {
  accept: string;
  chooseLabel: string;
  hint: string;
  upload: (file: File) => Promise<string | null>;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setItems(files.map((file) => ({ file, status: "pending" })));
  }

  function patch(index: number, next: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...next } : it)),
    );
  }

  async function uploadAll() {
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      // Retrying after a partial failure must not re-upload files that
      // already succeeded — that would duplicate them in the library.
      if (items[i].status === "done") continue;
      patch(i, { status: "uploading", error: undefined });

      const error = await upload(items[i].file);
      patch(i, error ? { status: "error", error } : { status: "done" });
    }
    setBusy(false);
    router.refresh();
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const allDone = items.length > 0 && items.every((i) => i.status === "done");

  return (
    <div className="flex flex-col gap-6">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white px-6 py-12 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {chooseLabel}
        </span>
        <span className="text-xs text-zinc-500">{hint}</span>
        <input
          type="file"
          accept={accept}
          multiple
          onChange={onSelect}
          disabled={busy}
          className="hidden"
        />
      </label>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="truncate text-zinc-800 dark:text-zinc-200">
                {it.file.name}
              </span>
              <StatusBadge status={it.status} error={it.error} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={uploadAll}
          disabled={busy || items.length === 0 || allDone}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy
            ? "Uploading…"
            : allDone
              ? "Uploaded"
              : `Upload ${items.length || ""} file${items.length === 1 ? "" : "s"}`.trim()}
        </button>
        {items.length > 0 && (
          <span className="text-sm text-zinc-500">
            {doneCount}/{items.length} done
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: ItemStatus;
  error?: string;
}) {
  const map: Record<ItemStatus, string> = {
    pending: "text-zinc-400",
    uploading: "text-blue-600 dark:text-blue-400",
    done: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
  };
  const label =
    status === "error" ? (error ?? "error") : status === "done" ? "✓ done" : status;
  return (
    <span className={`shrink-0 text-xs font-medium ${map[status]}`} title={error}>
      {label}
    </span>
  );
}
