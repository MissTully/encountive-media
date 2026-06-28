import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (runs in the browser).
 *
 * Only the public URL and the publishable/anon key are used here, so nothing
 * secret is shipped to the browser. Row Level Security is what actually scopes
 * data to the current user's organization — see the database schema.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
