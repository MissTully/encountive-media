"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/env";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = hasSupabaseConfig();

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Google sends the user back here; the route exchanges the code for a
        // session and redirects into the app.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google, so no further UI needed.
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 font-sans">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-line bg-surface p-8">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Encountive Inc · Sales &amp; Marketing
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Encountive <span className="font-light italic text-accent">Media</span>
          </h1>
          <p className="text-sm leading-6 text-muted">
            Your social media marketing agent. Sign in to begin the creative
            journey.
          </p>
        </div>

        {!configured && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Supabase isn&apos;t configured yet. Add your env vars and enable the
            Google provider in the Supabase dashboard.
          </p>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading || !configured}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <GoogleIcon />
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
