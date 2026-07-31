"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";

export interface TimelineClip {
  id: string;
  label: string | null;
  durationSeconds: number;
  mediaType: "image" | "video";
  /** Thumbnail/preview source for the block. */
  mediaUrl: string | null;
}

/**
 * The editor's track view: a visual track of clip blocks (width proportional
 * to duration) above a separate audio track showing the soundtrack's actual
 * waveform, with a shared time ruler and a playhead driven by the preview
 * player. The waveform is decoded in the browser (Web Audio) from the same
 * signed URL the player uses; when the track is shorter than the video it is
 * tiled at reduced opacity to show where the loop repeats.
 */
export function TimelineTracks({
  clips,
  audioUrl,
  audioLabel,
  elapsed,
}: {
  clips: TimelineClip[];
  audioUrl: string | null;
  audioLabel: string | null;
  elapsed: number;
}) {
  const totalSeconds = clips.reduce(
    (sum, c) => sum + Math.max(c.durationSeconds, 0.1),
    0,
  );

  if (clips.length === 0 || totalSeconds === 0) return null;

  const playheadPct = Math.min((elapsed / totalSeconds) * 100, 100);

  // Ruler ticks: aim for ~8 labels at a round interval.
  const tickStep = totalSeconds <= 12 ? 2 : totalSeconds <= 40 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSeconds; t += tickStep) ticks.push(t);

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative">
        {/* Time ruler */}
        <div className="relative mb-1 h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-zinc-400"
              style={{ left: `${(t / totalSeconds) * 100}%` }}
            >
              {formatClock(t)}
            </span>
          ))}
        </div>

        {/* Visual track — one block per clip, width ∝ duration */}
        <div className="flex h-16 gap-px overflow-hidden rounded-lg">
          {clips.map((c) => (
            <div
              key={c.id}
              className="relative min-w-0 overflow-hidden bg-zinc-200 dark:bg-zinc-800"
              style={{
                flexGrow: Math.max(c.durationSeconds, 0.1),
                flexBasis: 0,
              }}
              title={c.label ?? undefined}
            >
              {c.mediaUrl && c.mediaType === "video" ? (
                <video
                  src={c.mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : c.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.mediaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              <span className="absolute bottom-0.5 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                {c.durationSeconds}s
              </span>
              {c.mediaType === "video" && (
                <span className="absolute right-1 top-0.5 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
                  ▶
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Audio track — separate lane with the decoded waveform */}
        <div className="relative mt-1 h-12 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {audioUrl ? (
            // Keyed by URL so a soundtrack change remounts with fresh state.
            <Waveform key={audioUrl} audioUrl={audioUrl} totalSeconds={totalSeconds} />
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-zinc-300 text-[11px] text-zinc-400 dark:border-zinc-700">
              No soundtrack — pick one above to see its waveform here.
            </div>
          )}
          {audioLabel && (
            <span className="absolute left-1 top-0.5 max-w-[60%] truncate rounded bg-black/50 px-1 text-[10px] font-medium text-white">
              ♪ {audioLabel}
            </span>
          )}
        </div>

        {/* Playhead across both lanes (below the ruler) */}
        <div
          className="pointer-events-none absolute bottom-0 top-4 w-0.5 bg-red-500"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-zinc-500">
        {formatClock(elapsed)} / {formatClock(totalSeconds)}
      </span>
    </div>
  );
}

/**
 * Decodes the soundtrack and draws its waveform. When the track is shorter
 * than the video it repeats (matching playback), with later loops dimmed.
 */
function Waveform({
  audioUrl,
  totalSeconds,
}: {
  audioUrl: string;
  totalSeconds: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<{
    peaks: number[];
    duration: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const channel = audio.getChannelData(0);
        const BUCKETS = 400;
        const bucketSize = Math.max(1, Math.floor(channel.length / BUCKETS));
        const peaks: number[] = [];
        for (let b = 0; b < BUCKETS; b++) {
          let max = 0;
          const start = b * bucketSize;
          // Sample within the bucket (stride keeps decode cheap on long files).
          const stride = Math.max(1, Math.floor(bucketSize / 50));
          for (let i = start; i < start + bucketSize && i < channel.length; i += stride) {
            const v = Math.abs(channel[i]);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        if (!cancelled) setDecoded({ peaks, duration: audio.duration });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    const W = (canvas.width = 1200);
    const H = (canvas.height = 96);
    const g = canvas.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, W, H);

    // One tile = the real track length on the video's time scale.
    const tileWidth = Math.max((decoded.duration / totalSeconds) * W, 1);
    const barWidth = tileWidth / decoded.peaks.length;
    let x = 0;
    let loop = 0;
    while (x < W) {
      g.fillStyle = loop === 0 ? "rgba(59,130,246,0.85)" : "rgba(59,130,246,0.35)";
      for (let i = 0; i < decoded.peaks.length; i++) {
        const bx = x + i * barWidth;
        if (bx > W) break;
        const h = Math.max(decoded.peaks[i] * H * 0.9, 1.5);
        g.fillRect(bx, (H - h) / 2, Math.max(barWidth * 0.7, 0.5), h);
      }
      // Loop divider
      if (loop > 0) {
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillRect(x, 0, 1, H);
      }
      x += tileWidth;
      loop++;
    }
  }, [decoded, totalSeconds]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-zinc-400">
        Couldn&apos;t decode the audio for a waveform — playback still works.
      </div>
    );
  }
  if (!decoded) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-zinc-400">
        Loading waveform…
      </div>
    );
  }
  return <canvas ref={canvasRef} className="h-full w-full" />;
}
