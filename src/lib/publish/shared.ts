// Shared shapes and helpers for the platform publishers, kept separate from
// index.ts so the dispatcher and the platform modules don't import each other.

export interface PublishInput {
  /** Publicly fetchable URLs for the rendered slides, in carousel order. */
  imageUrls: string[];
  caption: string;
  /** Platform-side identity to post as (IG user id / Page id / author URN). */
  accountRef: string;
  accessToken: string;
}

export interface PublishResult {
  postRef: string;
  postUrl: string | null;
}

/** Shared fetch wrapper: JSON in/out with a readable error on failure. */
export async function apiCall<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(
      `${label} failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  // Some endpoints return an empty body on success.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Bounded wait between polls, matching the Creatomate sub-flow cadence. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
