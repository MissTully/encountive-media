"use client";

import { useEffect, useRef, useState } from "react";

export interface PreviewSlide {
  id: string;
  headline: string | null;
  bodyCopy: string | null;
  /** Finished render if available, otherwise the raw background image. */
  imageUrl: string | null;
  /** True when imageUrl is a finished render (text already baked in). */
  isRendered: boolean;
}

// Playback pacing and canvas size of the final video (4:5 portrait feed).
const SECONDS_PER_SLIDE = 4;
const CANVAS_W = 1080;
const CANVAS_H = 1350;

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Plays the carousel as the finished video would look: each slide holds for a
 * few seconds on a 1080x1350 canvas (crossfading between slides) while the
 * selected soundtrack plays underneath. Slides without a finished render are
 * composited live with the same layout Creatomate uses (dark overlay,
 * headline, body), so the preview approximates the final form either way.
 */
export function VideoPreview({
  slides,
  audioUrl,
  audioLabel,
}: {
  slides: PreviewSlide[];
  audioUrl: string | null;
  audioLabel: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scale, setScale] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const startedAtRef = useRef<number>(0);

  const totalSeconds = slides.length * SECONDS_PER_SLIDE;
  const current = Math.min(
    Math.floor(elapsed / SECONDS_PER_SLIDE),
    slides.length - 1,
  );

  // The stage renders at the real 1080x1350 canvas size and is scaled down to
  // fit its container, so text proportions match the final output exactly.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CANVAS_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drive the timeline while playing; stop at the end of the last slide.
  useEffect(() => {
    if (!playing) return;
    startedAtRef.current = performance.now() - elapsed * 1000;
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - startedAtRef.current) / 1000;
      if (t >= totalSeconds) {
        setElapsed(totalSeconds);
        setPlaying(false);
        return;
      }
      setElapsed(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSeconds]);

  // Keep the soundtrack in lockstep with the timeline.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.currentTime = elapsed % Math.max(audio.duration || totalSeconds, 1);
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function toggle() {
    if (!playing && elapsed >= totalSeconds) setElapsed(0);
    setPlaying((p) => !p);
  }

  function restart() {
    setElapsed(0);
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    setPlaying(true);
  }

  if (slides.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={stageRef}
        className="relative w-full max-w-sm overflow-hidden rounded-xl bg-black shadow-lg"
        style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
          }}
        >
          {slides.map((s, i) => (
            <div
              key={s.id}
              className="absolute inset-0 transition-opacity duration-500"
              style={{ opacity: i === current ? 1 : 0 }}
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageUrl}
                  alt={`Slide ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-zinc-800" />
              )}
              {/* Mirror the Creatomate composition for un-rendered slides:
                  dark overlay, 72px headline above 42%, 38px body below 48%. */}
              {!s.isRendered && (
                <>
                  <div className="absolute inset-0 bg-black/45" />
                  <div
                    className="absolute flex items-end justify-center text-center"
                    style={{ left: "8%", right: "8%", top: 0, height: "42%" }}
                  >
                    <span
                      className="font-bold text-white"
                      style={{ fontSize: 72, lineHeight: 1.15 }}
                    >
                      {s.headline ?? ""}
                    </span>
                  </div>
                  <div
                    className="absolute flex items-start justify-center text-center"
                    style={{ left: "11%", right: "11%", top: "48%" }}
                  >
                    <span
                      className="text-zinc-100"
                      style={{ fontSize: 38, lineHeight: 1.4 }}
                    >
                      {s.bodyCopy ?? ""}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Per-slide progress segments, like a story player. */}
        <div className="absolute left-2 right-2 top-2 flex gap-1">
          {slides.map((s, i) => {
            const start = i * SECONDS_PER_SLIDE;
            const fill = Math.min(
              Math.max((elapsed - start) / SECONDS_PER_SLIDE, 0),
              1,
            );
            return (
              <div
                key={s.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  className="h-full bg-white"
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} loop preload="auto" />}

      <div className="flex w-full max-w-sm items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {playing ? "Pause" : elapsed >= totalSeconds ? "Replay" : "Play"}
          </button>
          <button
            type="button"
            onClick={restart}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Restart
          </button>
        </div>
        <span className="text-xs tabular-nums text-zinc-500">
          Slide {current + 1}/{slides.length} · {formatClock(elapsed)} /{" "}
          {formatClock(totalSeconds)}
        </span>
      </div>

      <span className="w-full max-w-sm truncate text-xs text-zinc-500">
        {audioLabel ? <>♪ {audioLabel}</> : "No soundtrack selected — silent preview."}
      </span>
    </div>
  );
}
