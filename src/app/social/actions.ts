"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Server actions are reachable via direct POST, not just the UI — verify the
// session first (RLS is the second line of defense).
async function requireProfile() {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Disconnect a social account. Post history survives (social_posts keeps the
 * platform + account name); only the stored token and destination go away.
 */
export async function disconnectAccount(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await requireProfile();

  const supabase = await createClient();
  const { error } = await supabase.from("social_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/social");
}
