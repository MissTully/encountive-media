"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAssetsToProject } from "../../actions";

interface SelectableAsset {
  id: string;
  title: string | null;
  url: string | null;
  attached: boolean;
}

export function AssetSelector({
  projectId,
  assets,
}: {
  projectId: string;
  assets: SelectableAsset[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      await addAssetsToProject(projectId, Array.from(selected));
      router.push(`/projects/${projectId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-zinc-50/90 py-2 backdrop-blur dark:bg-black/90">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {selected.size} selected
        </span>
        <button
          type="button"
          onClick={addSelected}
          disabled={selected.size === 0 || isPending}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPending
            ? "Adding…"
            : `Add ${selected.size || ""} to board`.trim()}
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {assets.map((a) => {
          const isSelected = selected.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => !a.attached && toggle(a.id)}
                disabled={a.attached}
                className={`group relative flex w-full flex-col overflow-hidden rounded-lg border-2 text-left transition-colors ${
                  a.attached
                    ? "cursor-not-allowed border-zinc-200 opacity-60 dark:border-zinc-800"
                    : isSelected
                      ? "border-blue-500"
                      : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                }`}
              >
                <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.title ?? "Image"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                      no preview
                    </div>
                  )}
                  {(isSelected || a.attached) && (
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                        a.attached ? "bg-zinc-500" : "bg-blue-500"
                      }`}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <div className="bg-white px-2.5 py-2 dark:bg-zinc-950">
                  <span className="block truncate text-xs text-zinc-700 dark:text-zinc-300">
                    {a.attached ? "On board" : (a.title ?? "Untitled")}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
