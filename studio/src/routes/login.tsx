import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="text-sm font-medium">Encountive Studio</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Sign in</p>
          </div>
        </div>
        <h1 className="font-display text-3xl leading-tight">
          Campaigns, sound, and publish — under one roof.
        </h1>
        <p className="text-sm text-muted">
          Google or X. Publishing to LinkedIn and Instagram is connected after
          you are in.
        </p>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                className="w-full"
                variant={p.providerId === "google" ? "default" : "secondary"}
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link to="/" className="block text-xs text-muted hover:text-fg">
          Back to studio
        </Link>
      </div>
    </main>
  );
}
