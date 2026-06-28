import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback. Google (via Supabase) redirects here with a `code`, which we
 * exchange for a session cookie, then send the user on into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to land after sign-in; defaults to the home page.
  const next = searchParams.get("next") ?? "/";

  // Redirect to the error page, carrying a human-readable reason so failures
  // are diagnosable without digging through server logs.
  const errorRedirect = (reason?: string | null) => {
    const url = new URL("/auth/auth-code-error", origin);
    if (reason) url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  // Instead of a `code`, the provider (via Supabase) can redirect back with an
  // error — e.g. a misconfigured Google client ID/secret in the Supabase
  // dashboard surfaces here as `error_description`.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return errorRedirect(providerError);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `x-forwarded-host` is the user-facing host behind Vercel's proxy.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    return errorRedirect(error.message);
  }

  // No code and no error param — nothing we can do with this request.
  return errorRedirect(null);
}
