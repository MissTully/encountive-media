/**
 * Tiny helper to read required environment variables and fail loudly with a
 * helpful message if one is missing, instead of a confusing runtime error
 * deep inside a client library. See .env.example for the full list.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** True when the public Supabase config is present (used to gate UI calls). */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
