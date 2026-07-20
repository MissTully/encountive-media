"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

const PLATFORMS = ["instagram", "facebook", "linkedin"] as const;

/** Connect a publishing destination by pasting its id + long-lived token. */
export async function addSocialAccount(formData: FormData) {
  const platform = String(formData.get("platform") ?? "").trim();
  const accountName = String(formData.get("account_name") ?? "").trim();
  const accountRef = String(formData.get("account_ref") ?? "").trim();
  const accessToken = String(formData.get("access_token") ?? "").trim();
  if (!(PLATFORMS as readonly string[]).includes(platform)) return;
  if (!accountName || !accountRef || !accessToken) return;

  // Server actions are reachable via direct POST — verify the session before
  // writing (RLS alone fails silently on zero matched rows).
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.from("social_accounts").upsert(
    {
      org_id: ctx.profile.org_id,
      platform,
      display_name: accountName,
      external_id: accountRef,
      access_token: accessToken,
      connected_by: ctx.profile.id,
    },
    { onConflict: "org_id,platform,external_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/connections");
}

/** Disconnect a destination. Its publication history rows go with it. */
export async function removeSocialAccount(accountId: string) {
  const ctx = await getProfile();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", accountId);
  if (error) throw new Error(error.message);

  revalidatePath("/connections");
}
