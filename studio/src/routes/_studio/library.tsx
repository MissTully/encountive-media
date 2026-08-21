import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { AudioMixer } from "@/components/audio-mixer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/hooks/use-hydrated";
import { uid, useStudio } from "@/lib/store";

export const Route = createFileRoute("/_studio/library")({
  component: LibraryPage,
});

const FILTERS = ["all", "still", "motion", "nursing", "hospital", "generated"] as const;

function LibraryPage() {
  const hydrated = useHydrated();
  const assets = useStudio((s) => s.assets);
  const addAsset = useStudio((s) => s.addAsset);
  const patchAsset = useStudio((s) => s.patchAsset);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [active, setActive] = useState<string | null>(null);

  const shown = assets.filter((a) => {
    if (filter === "all") return true;
    if (filter === "still" || filter === "motion") return a.kind === filter;
    return a.tags.includes(filter);
  });
  const selected = assets.find((a) => a.id === active) ?? shown[0];

  function onUploadVideo(file: File) {
    const url = URL.createObjectURL(file);
    const id = uid("ast");
    addAsset({
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      kind: "motion",
      url,
      originalUrl: url,
      tags: ["motion", "upload"],
    });
    setActive(id);
    setFilter("motion");
    toast.success("Video added. Add music, narration, or both.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-fg">Library</h1>
          <p className="mt-1 text-sm text-muted">
            Text-free stills and Imagine motion. Open any clip to add a soundtrack
            or voiceover.
          </p>
        </div>
        <label>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadVideo(f);
            }}
          />
          <Button asChild variant="secondary" size="sm">
            <span>
              <Upload className="size-3.5" />
              Upload video
            </span>
          </Button>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "h-9 rounded-full border px-3 text-xs capitalize",
              filter === f
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-fg",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {!hydrated ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {shown.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActive(a.id)}
                  className={cn(
                    "overflow-hidden rounded-lg border text-left",
                    selected?.id === a.id ? "border-accent" : "border-border",
                  )}
                >
                  <div className="relative aspect-square bg-elevated">
                    {a.kind === "motion" ? (
                      <video
                        src={a.mixedUrl || a.url}
                        poster={a.posterUrl}
                        muted
                        playsInline
                        className="size-full object-cover"
                      />
                    ) : (
                      <img src={a.url} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <p className="truncate text-xs text-fg">{a.title}</p>
                    <p className="truncate text-[11px] text-muted">
                      {a.kind}
                      {a.mixedUrl ? " · mixed" : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {selected && selected.kind !== "motion" ? (
              <aside className="h-fit rounded-xl border border-border bg-surface p-4">
                <img src={selected.url} alt="" className="w-full rounded-md" />
                <p className="mt-3 text-sm font-medium text-fg">{selected.title}</p>
                {selected.prompt ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted">{selected.prompt}</p>
                ) : null}
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-subtle">
                  {selected.tags.join(" · ")}
                </p>
              </aside>
            ) : (
              <aside className="h-fit rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-fg">{selected?.title ?? "Select a clip"}</p>
                <p className="mt-2 text-xs text-muted">
                  Soundtrack opens under the grid for motion clips — music,
                  narration, or both.
                </p>
              </aside>
            )}
          </div>
          {selected?.kind === "motion" ? (
            <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
              <h2 className="font-display text-xl text-fg">Soundtrack</h2>
              <p className="mt-1 text-sm text-muted">
                Works on Imagine clips and videos you upload. Mix music only,
                narration only, or both.
              </p>
              <div className="mt-4">
                <AudioMixer
                  key={selected.id}
                  id={selected.id}
                  videoUrl={selected.originalUrl || selected.url}
                  posterUrl={selected.posterUrl}
                  title={selected.title}
                  caption={selected.prompt || selected.title}
                  duration={6}
                  onMixed={(_blob, url, label) => {
                    patchAsset(selected.id, {
                      originalUrl: selected.originalUrl || selected.url,
                      mixedUrl: url,
                      url,
                    });
                    toast.success(`Saved ${label} mix to the library.`);
                  }}
                />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
