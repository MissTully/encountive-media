"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { VideoPreview, type PreviewSlide } from "@/components/video-preview";
import { TimelineTracks } from "@/components/timeline-tracks";
import {
  addClipsToVideo,
  moveClip,
  removeClip,
  renderVideoNow,
  updateClip,
  updateVideoSettings,
} from "../actions";
import { VIDEO_STATUS_STYLES } from "../status";

export interface EditorClip {
  id: string;
  headline: string | null;
  bodyCopy: string | null;
  durationSeconds: number;
  imageUrl: string | null;
  mediaType: "image" | "video";
}

interface PickerAsset {
  id: string;
  title: string | null;
  url: string | null;
}

interface PickerClip extends PickerAsset {
  durationSeconds: number | null;
}

/**
 * The video editor: a clip timeline (add / reorder / caption / time images
 * from the library), a soundtrack picker, a live preview that plays the cut
 * exactly as the finished video will look, and render-to-MP4 + download.
 */
export function Editor({
  video,
  clips,
  pickerAssets,
  pickerClips,
  tracks,
  audioUrl,
  outputUrl,
  downloadUrl,
  creatomateReady,
  notice,
}: {
  video: {
    id: string;
    title: string;
    status: string;
    width: number;
    height: number;
    audioAssetId: string | null;
    renderError: string | null;
  };
  clips: EditorClip[];
  pickerAssets: PickerAsset[];
  pickerClips: PickerClip[];
  tracks: Array<{ id: string; label: string }>;
  audioUrl: string | null;
  outputUrl: string | null;
  downloadUrl: string | null;
  creatomateReady: boolean;
  notice: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(clips.length === 0);
  const [pickerTab, setPickerTab] = useState<"images" | "clips">("images");
  // Selection keys carry the media kind: "img:<id>" or "vid:<id>".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [pending, startTransition] = useTransition();

  const audioLabel =
    tracks.find((t) => t.id === video.audioAssetId)?.label ?? null;

  const previewSlides: PreviewSlide[] = clips.map((c) => ({
    id: c.id,
    headline: c.headline,
    bodyCopy: c.bodyCopy,
    imageUrl: c.imageUrl,
    isRendered: false,
    durationSeconds: c.durationSeconds,
    mediaType: c.mediaType,
  }));

  const totalSeconds = clips.reduce((sum, c) => sum + c.durationSeconds, 0);

  const visibleAssets = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const pool = pickerTab === "images" ? pickerAssets : pickerClips;
    if (!f) return pool;
    return pool.filter((a) => (a.title ?? "").toLowerCase().includes(f));
  }, [pickerAssets, pickerClips, pickerTab, filter]);

  function toggleAsset(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addSelected() {
    const items = Array.from(selected).map((key) =>
      key.startsWith("img:")
        ? { imageId: key.slice(4) }
        : { clipId: key.slice(4) },
    );
    startTransition(async () => {
      await addClipsToVideo(video.id, items);
      setSelected(new Set());
      setPickerOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Title, format, status, soundtrack. */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <form
          action={updateVideoSettings.bind(null, video.id)}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* key: after a form action React resets uncontrolled fields to
                their defaultValue-at-render — keying by the saved value forces
                a remount to the fresh server state instead of the stale one. */}
            <input
              key={video.title}
              name="title"
              defaultValue={video.title}
              aria-label="Video title"
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-2xl font-semibold tracking-tight text-zinc-900 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none dark:text-zinc-50 dark:hover:border-zinc-800 dark:focus:border-zinc-600"
            />
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                VIDEO_STATUS_STYLES[video.status] ?? VIDEO_STATUS_STYLES.draft
              }`}
            >
              {video.status}
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              {video.width}×{video.height} · {clips.length} clip
              {clips.length === 1 ? "" : "s"} · {Math.round(totalSeconds)}s
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="audio_asset_id"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Soundtrack
            </label>
            <select
              key={video.audioAssetId ?? "none"}
              id="audio_asset_id"
              name="audio_asset_id"
              defaultValue={video.audioAssetId ?? ""}
              className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">None (silent)</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Save
            </button>
            {tracks.length === 0 && (
              <Link
                href="/music/upload"
                className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Upload music first
              </Link>
            )}
          </div>
        </form>
      </section>

      {notice && (
        <p className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
          {notice}
        </p>
      )}
      {video.status === "error" && video.renderError && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Last render failed: {video.renderError}
        </p>
      )}

      {/* Track view: visuals and soundtrack on separate lanes, shared
          time scale, playhead driven by the preview player. */}
      {clips.length > 0 && (
        <TimelineTracks
          clips={clips.map((c) => ({
            id: c.id,
            label: c.headline,
            durationSeconds: c.durationSeconds,
            mediaType: c.mediaType,
            mediaUrl: c.imageUrl,
          }))}
          audioUrl={audioUrl}
          audioLabel={audioLabel}
          elapsed={elapsed}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
        {/* Timeline: the clips in play order. */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Timeline
            </h2>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pickerOpen ? "Close picker" : "+ Add clips"}
            </button>
          </div>

          {pickerOpen && (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
                {(
                  [
                    ["images", `Images (${pickerAssets.length})`],
                    ["clips", `Video clips (${pickerClips.length})`],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPickerTab(tab)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
                      pickerTab === tab
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={
                    pickerTab === "images"
                      ? "Filter recent library images…"
                      : "Filter video clips…"
                  }
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={addSelected}
                  disabled={selected.size === 0 || pending}
                  className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {pending
                    ? "Adding…"
                    : `Add ${selected.size || ""} clip${selected.size === 1 ? "" : "s"}`.trim()}
                </button>
              </div>
              {visibleAssets.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">
                  {pickerTab === "images" ? (
                    <>
                      No ready images in the library yet —{" "}
                      <Link href="/upload" className="underline">
                        upload some
                      </Link>{" "}
                      first.
                    </>
                  ) : (
                    <>
                      No video clips yet —{" "}
                      <Link href="/clips/upload" className="underline">
                        upload b-roll and product footage
                      </Link>{" "}
                      first.
                    </>
                  )}
                </p>
              ) : (
                <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                  {visibleAssets.map((a) => {
                    const key = `${pickerTab === "images" ? "img" : "vid"}:${a.id}`;
                    const isSelected = selected.has(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => toggleAsset(key)}
                          className={`relative block w-full overflow-hidden rounded-lg border-2 ${
                            isSelected
                              ? "border-blue-500"
                              : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
                          }`}
                          title={a.title ?? undefined}
                        >
                          {a.url && pickerTab === "clips" ? (
                            <video
                              src={a.url}
                              muted
                              playsInline
                              preload="metadata"
                              className="aspect-square w-full object-cover"
                            />
                          ) : a.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.url}
                              alt={a.title ?? "Library image"}
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-square items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-900">
                              no preview
                            </div>
                          )}
                          {isSelected && (
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                              ✓
                            </span>
                          )}
                          {pickerTab === "clips" && (
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                              ▶
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {clips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No clips yet — add images from your library to start the video.
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {clips.map((c, i) => (
                <li
                  key={c.id}
                  className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <button
                      type="button"
                      aria-label="Move clip earlier"
                      disabled={i === 0 || pending}
                      onClick={() =>
                        startTransition(() => moveClip(video.id, c.id, "up"))
                      }
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                    >
                      ↑
                    </button>
                    <span className="text-xs font-medium text-zinc-400">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label="Move clip later"
                      disabled={i === clips.length - 1 || pending}
                      onClick={() =>
                        startTransition(() => moveClip(video.id, c.id, "down"))
                      }
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                    {c.imageUrl && c.mediaType === "video" ? (
                      <video
                        src={c.imageUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imageUrl}
                        alt={`Clip ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                        no media
                      </div>
                    )}
                    {c.mediaType === "video" && (
                      <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                        ▶
                      </span>
                    )}
                  </div>
                  <form
                    action={updateClip.bind(null, video.id, c.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1.5"
                  >
                    <input
                      key={c.headline ?? ""}
                      name="headline"
                      defaultValue={c.headline ?? ""}
                      placeholder="Headline (overlaid on the clip)"
                      className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-600"
                    />
                    <input
                      key={c.bodyCopy ?? ""}
                      name="body_copy"
                      defaultValue={c.bodyCopy ?? ""}
                      placeholder="Body copy (optional)"
                      className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:text-zinc-300 dark:focus:border-zinc-600"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Hold
                        <input
                          key={c.durationSeconds}
                          name="duration_seconds"
                          type="number"
                          min={1}
                          max={15}
                          step={0.5}
                          defaultValue={c.durationSeconds}
                          className="w-16 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-600"
                        />
                        s
                      </label>
                      <button
                        type="submit"
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(() => removeClip(video.id, c.id))
                        }
                        className="ml-auto rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        Remove
                      </button>
                    </div>
                  </form>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Preview + render/download. */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Preview
          </h2>
          {clips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Add clips to preview the video.
            </div>
          ) : (
            <VideoPreview
              slides={previewSlides}
              audioUrl={audioUrl}
              audioLabel={audioLabel}
              canvasWidth={video.width}
              canvasHeight={video.height}
              onProgress={setElapsed}
            />
          )}

          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Finished video
            </h3>
            {outputUrl && (
              <video
                controls
                src={outputUrl}
                className="w-full rounded-lg bg-black"
                style={{ aspectRatio: `${video.width} / ${video.height}` }}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {/* Stays clickable while status is "rendering": if a previous
                  render's function died mid-run the row would say rendering
                  forever, and this is the recovery path. */}
              <form action={renderVideoNow.bind(null, video.id)}>
                <button
                  type="submit"
                  disabled={clips.length === 0 || !creatomateReady}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {video.status === "rendering"
                    ? "Retry render"
                    : outputUrl
                      ? "Re-render MP4"
                      : "Render MP4"}
                </button>
              </form>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="rounded-full border border-green-300 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950"
                >
                  ⬇ Download MP4
                </a>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {creatomateReady
                ? "Rendering assembles the clips and soundtrack into a real MP4 (takes a minute or two), then it appears here to watch and download."
                : "Rendering to MP4 needs the CREATOMATE_API_KEY environment variable — the live preview above works without it."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
