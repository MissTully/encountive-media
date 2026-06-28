"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

/** Create or update the organization's brand kit. */
export async function saveBrandKit(formData: FormData) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || "Brand Kit";
  const colors = String(formData.get("colors") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const fonts = {
    heading: String(formData.get("heading_font") ?? "").trim() || null,
    body: String(formData.get("body_font") ?? "").trim() || null,
  };
  const logo_url = String(formData.get("logo_url") ?? "").trim() || null;
  const voice_guidelines =
    String(formData.get("voice_guidelines") ?? "").trim() || null;

  const supabase = await createClient();
  const payload = {
    org_id: ctx.profile.org_id,
    name,
    colors,
    fonts,
    logo_url,
    voice_guidelines,
  };

  const { error } = id
    ? await supabase.from("brand_kits").update(payload).eq("id", id)
    : await supabase.from("brand_kits").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/brand");
}
