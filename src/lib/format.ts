// Tiny display helpers shared across pages and components.

/** Seconds → "m:ss" (floors, so 89.6s shows as 1:29). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Nullable-friendly wrapper for track durations from the database. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return formatClock(seconds);
}

/** "Title — Artist" label used by every soundtrack picker and caption. */
export function trackLabel(title: string | null, artist: string | null): string {
  return [title ?? "Untitled", artist].filter(Boolean).join(" — ");
}
