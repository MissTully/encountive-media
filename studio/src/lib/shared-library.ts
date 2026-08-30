import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSupabaseEnv } from "@/lib/supabase.server";
import type { LibraryAsset } from "@/lib/types";

/**
 * The shared Encountive image library — the same Supabase project the media
 * app (repo root) uploads into: the `assets` catalog table + private `assets`
 * storage bucket. Studio reads it directly so there is one source of truth,
 * nothing copied. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; without
 * them Studio just shows its local library.
 *
 * The bucket is private, so each listing signs short-lived URLs (one batch
 * call) rather than making anything public.
 */

const SIGN_TTL_SECONDS = 3600;

type AssetRow = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  storage_path: string;
  status: string;
};

type SignedEntry = {
  path: string;
  signedURL: string | null;
  error: string | null;
};

export const listSharedAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<LibraryAsset[]> => {
    const sb = getSupabaseEnv();
    if (!sb) return [];

    const auth = { Authorization: `Bearer ${sb.serviceKey}`, apikey: sb.serviceKey };
    const listRes = await fetch(
      `${sb.url}/rest/v1/assets?select=id,title,description,tags,storage_path,status&order=created_at.desc`,
      { headers: auth },
    );
    if (!listRes.ok) {
      throw new Error(`Shared library listing failed (${listRes.status})`);
    }
    const rows = (await listRes.json()) as AssetRow[];
    if (rows.length === 0) return [];

    const signRes = await fetch(`${sb.url}/storage/v1/object/sign/assets`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresIn: SIGN_TTL_SECONDS,
        paths: rows.map((r) => r.storage_path),
      }),
    });
    if (!signRes.ok) {
      throw new Error(`Shared library URL signing failed (${signRes.status})`);
    }
    const signed = (await signRes.json()) as SignedEntry[];
    const urlByPath = new Map(
      signed
        .filter((s) => s.signedURL)
        .map((s) => [s.path, `${sb.url}/storage/v1${s.signedURL}`]),
    );

    const out: LibraryAsset[] = [];
    for (const row of rows) {
      const url = urlByPath.get(row.storage_path);
      if (!url) continue; // file missing from the bucket — skip, don't break the grid
      out.push({
        id: `shared-${row.id}`,
        title: row.title ?? "Untitled",
        kind: "still",
        url,
        tags: ["shared", ...(row.tags ?? [])],
        prompt: row.description ?? undefined,
      });
    }
    return out;
  });
