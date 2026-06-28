"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ItemStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  file: File;
  status: ItemStatus;
  error?: string;
}

/** Reads an image's pixel dimensions in the browser (best effort). */
function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function fileExt(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
}

export function Uploader({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
      const { file } = items[i];
      patch(i, { status: "uploading", error: undefined });

      // Path is prefixed with the org id so the storage RLS policy authorizes it.
      const id = crypto.randomUUID();
      const path = `${orgId}/${id}.${fileExt(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        patch(i, { status: "error", error: uploadError.message });
        continue;
      }

      const dims = await readDimensions(file);
      const { error: insertError } = await supabase.from("assets").insert({
        org_id: orgId,
        storage_path: path,
        source: "uploaded",
        status: "uploaded",
        mime_type: file.type || null,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      });
      if (insertError) {
        // Roll back the orphaned storage object so it doesn't linger.
        await supabase.storage.from("assets").remove([path]);
        patch(i, { status: "error", error: insertError.message });
        continue;
      }

      patch(i, { status: "done" });
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
          Choose images to upload
        </span>
        <span className="text-xs text-zinc-500">
          Select multiple files — JPG, PNG, WebP, GIF
        </span>
        <input
          type="file"
          accept="image/*"
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
