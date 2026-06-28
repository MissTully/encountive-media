import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Route Handlers, and Server
 * Actions. It reads and writes the auth session from cookies so the signed-in
 * user is available on the server.
 *
 * Note: in a Server Component the cookie store is read-only, so the `setAll`
 * call can throw. That's expected — the middleware (see src/middleware.ts) is
 * responsible for refreshing the session cookie, so we safely ignore it here.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore. Session refresh
            // happens in middleware.
          }
        },
      },
    },
  );
}
