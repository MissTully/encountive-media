import { createMediaUpload } from "@/lib/publish";

export async function uploadPublicBlob(
  blob: Blob,
  filename: string,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const signed = await createMediaUpload({
    data: { filename, contentType: blob.type || "application/octet-stream" },
  });
  if (!signed.ok) return signed;
  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${signed.token}`,
      "Content-Type": blob.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: blob,
  });
  if (!put.ok) {
    return { ok: false, error: `Upload failed (${put.status})` };
  }
  return { ok: true, publicUrl: signed.publicUrl };
}
