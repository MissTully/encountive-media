import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Root proxy (formerly "middleware" — renamed in Next.js 16): keeps the
 * Supabase auth session fresh on every navigation. Route protection
 * (redirecting unauthenticated users) can be added here once auth screens exist.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image files, which don't need
     * a session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
