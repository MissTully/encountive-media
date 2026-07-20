// Query-string helpers shared by the searchable library pages.

/** Strip characters that would break PostgREST's `or` filter syntax. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*\\%]/g, " ").trim();
}

/**
 * Next.js searchParams values are `string | string[] | undefined` — a repeated
 * key (`?q=a&q=b`) arrives as an array. Collapse to the first value so pages
 * can't crash calling string methods on an array.
 */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
