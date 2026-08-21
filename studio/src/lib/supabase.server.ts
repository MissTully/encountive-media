/**
 * Optional Supabase overlay: Storage for public media (Instagram/LinkedIn
 * need a fetchable HTTPS URL) plus a status check. Postgres itself is still
 * `@/lib/db` — point `DATABASE_URL` at the Supabase pooler when you want
 * the same project for tables.
 */

export type SupabaseEnv = {
  url: string;
  serviceKey: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

export function supabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

function headers(sb: SupabaseEnv, json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${sb.serviceKey}`,
    apikey: sb.serviceKey,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function ensureMediaBucket(): Promise<void> {
  const sb = getSupabaseEnv();
  if (!sb) throw new Error("Supabase is not configured");
  const existing = await fetch(`${sb.url}/storage/v1/bucket/media`, { headers: headers(sb, false) });
  if (existing.ok) return;
  const create = await fetch(`${sb.url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(sb),
    body: JSON.stringify({
      id: "media",
      name: "media",
      public: true,
      file_size_limit: 52428800,
    }),
  });
  if (!create.ok && create.status !== 409) {
    const err = await create.text().catch(() => "");
    throw new Error(`Could not create media bucket (${create.status}): ${err.slice(0, 180)}`);
  }
}

export async function signMediaUpload(path: string): Promise<{
  uploadUrl: string;
  token: string;
  publicUrl: string;
}> {
  const sb = getSupabaseEnv();
  if (!sb) throw new Error("Supabase is not configured");
  await ensureMediaBucket();
  const sign = await fetch(`${sb.url}/storage/v1/object/upload/sign/media/${path}`, {
    method: "POST",
    headers: headers(sb),
    body: JSON.stringify({}),
  });
  if (!sign.ok) {
    const err = await sign.text().catch(() => "");
    throw new Error(`Sign upload ${sign.status}: ${err.slice(0, 180)}`);
  }
  const body = (await sign.json()) as { url?: string; token?: string };
  if (!body.url || !body.token) throw new Error("Supabase did not return an upload URL");
  const uploadUrl = body.url.startsWith("http") ? body.url : `${sb.url}/storage/v1${body.url}`;
  return {
    uploadUrl,
    token: body.token,
    publicUrl: `${sb.url}/storage/v1/object/public/media/${path}`,
  };
}

export async function uploadBytesToMedia(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const sb = getSupabaseEnv();
  if (!sb) throw new Error("Supabase is not configured");
  await ensureMediaBucket();
  const put = await fetch(`${sb.url}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: {
      ...headers(sb, false),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) {
    const err = await put.text().catch(() => "");
    throw new Error(`Storage PUT ${put.status}: ${err.slice(0, 180)}`);
  }
  return `${sb.url}/storage/v1/object/public/media/${path}`;
}

export async function probeSupabase(): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseEnv();
  if (!sb) return { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  try {
    const res = await fetch(`${sb.url}/storage/v1/bucket`, { headers: headers(sb, false) });
    if (!res.ok) return { ok: false, error: `Storage ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unreachable" };
  }
}
