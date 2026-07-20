"use client";

import { useState, useTransition } from "react";
import { renameAsset, deleteAsset, deleteAssets } from "./actions";
import { PendingButton } from "@/components/pending-button";

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  analyzing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

export interface LibraryItem {
  id: string;
  title: string | null;
  tags: string[];
  status: string | null;
  similarity: number | null;
  url: string | null;
  downloadUrl: string | null;
}

/**
 * The library card grid. Client-side so cards can be multi-selected (click a
 * thumbnail to toggle) and deleted in one batch, with pending feedback on
 * every destructive action. Rename/delete/bulk-delete are server actions;
 * revalidation re-renders the page with the fresh list.
 */
export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDeleting, startDelete] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    if (selected.size === 0 || isDeleting) return;
    const n = selected.size;
    if (
      !window.confirm(
        `Delete ${n} image${n === 1 ? "" : "s"} from the library? They'll also be removed from project boards. This can't be undone.`,
      )
    ) {
      return;
    }
    startDelete(async () => {
      await deleteAssets(Array.from(selected));
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-4 rounded-xl border border-red-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-red-900 dark:bg-zinc-950/95">
          <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
            {selected.size} image{selected.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={isDeleting}
            className="text-sm text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-300"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={isDeleting}
            className={`rounded-full px-4 py-1.5 text-sm font-medium text-white transition-colors ${
              isDeleting
                ? "animate-pulse cursor-wait bg-red-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {isDeleting ? "Deleting…" : `Delete ${selected.size} selected`}
          </button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((a) => {
          const isSelected = selected.has(a.id);
          return (
            <li
              key={a.id}
              className={`flex flex-col overflow-hidden rounded-lg border-2 bg-white transition-opacity dark:bg-zinc-950 ${
                isSelected
                  ? "border-blue-500"
                  : "border-zinc-200 dark:border-zinc-800"
              } ${isDeleting && isSelected ? "animate-pulse opacity-50" : ""}`}
            >
              {/* Thumbnail doubles as the selection toggle. */}
              <button
                type="button"
                onClick={() => toggle(a.id)}
                title={isSelected ? "Deselect" : "Select for bulk actions"}
                className="relative aspect-square bg-zinc-100 dark:bg-zinc-900"
              >
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.title ?? "Uploaded image"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                    no preview
                  </div>
                )}
                <span
                  className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isSelected
                      ? "bg-blue-500 text-white"
                      : "border border-zinc-300 bg-white/80 text-transparent dark:border-zinc-600 dark:bg-black/50"
                  }`}
                >
                  ✓
                </span>
                {a.similarity !== null && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                    {Math.round(a.similarity * 100)}% match
                  </span>
                )}
              </button>

              <div className="flex flex-col gap-1.5 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  {/* Inline rename: edit the title in place, ✓ to save. */}
                  <form
                    action={renameAsset.bind(null, a.id)}
                    className="flex min-w-0 flex-1 items-center gap-1"
                  >
                    <input
                      type="text"
                      name="title"
                      required
                      defaultValue={a.title ?? ""}
                      placeholder="Untitled"
                      className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-zinc-800 outline-none hover:border-zinc-200 focus:border-zinc-400 focus:bg-white dark:text-zinc-200 dark:hover:border-zinc-800 dark:focus:border-zinc-600 dark:focus:bg-zinc-950"
                    />
                    <PendingButton
                      label="✓"
                      pendingLabel="…"
                      title="Save name"
                      className="shrink-0 rounded px-1 text-xs text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                      pendingClassName="shrink-0 cursor-wait rounded px-1 text-xs text-blue-600 dark:text-blue-400"
                    />
                  </form>
                  {a.status && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLES[a.status] ?? STATUS_STYLES.uploaded
                      }`}
                    >
                      {a.status}
                    </span>
                  )}
                </div>
                {a.tags.length > 0 && (
                  <span className="truncate text-[11px] text-zinc-500">
                    {a.tags.slice(0, 4).join(" · ")}
                  </span>
                )}
                <div className="flex items-center justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-900">
                  {a.downloadUrl ? (
                    <a
                      href={a.downloadUrl}
                      className="text-[11px] font-medium text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
                    >
                      ⬇ Download
                    </a>
                  ) : (
                    <span />
                  )}
                  <form action={deleteAsset.bind(null, a.id)}>
                    <PendingButton
                      label="Delete"
                      pendingLabel="Deleting…"
                      title="Delete from library (removes it from project boards too)"
                      className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                      pendingClassName="animate-pulse cursor-wait text-[11px] font-medium text-red-600 dark:text-red-400"
                    />
                  </form>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
