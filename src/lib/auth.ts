import { createClient } from "@/lib/supabase/server";

/**
 * Returns the signed-in user together with their profile (which carries the
 * org_id used to scope all data), or null if not signed in / no profile yet.
 *
 * Use this in Server Components and Server Actions that need the current
 * organization. RLS still enforces access; org_id is for building queries.
 */
export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { user, profile };
}
