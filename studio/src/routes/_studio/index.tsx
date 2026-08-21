import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { PIPELINE } from "@/lib/brand";
import { useHydrated } from "@/hooks/use-hydrated";
import { useStudio } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_studio/")({
  component: StudioHome,
});

function StudioHome() {
  const hydrated = useHydrated();
  const campaigns = useStudio((s) => s.campaigns);
  const assets = useStudio((s) => s.assets);
  const review = campaigns.filter((c) => c.status === "review" || c.status === "changes");
  const approved = campaigns.filter((c) => c.status === "approved");

  if (!hydrated) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 sm:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              In-house media engine
            </p>
            <h1 className="mt-3 max-w-[12ch] font-display text-4xl leading-[1.05] text-fg sm:text-5xl">
              Campaigns from a brief.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
              Grok writes the deck. Imagine makes the stills and motion. Add a
              music bed, a voiceover, or both — then publish to LinkedIn and
              Instagram after a human gate.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/new">
                  <Plus className="size-4" />
                  New campaign
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/publish">
                  Publish
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative min-h-56 overflow-hidden border-t border-border lg:min-h-full lg:border-l lg:border-t-0">
            <img
              src="/stills/hero-mark.jpg"
              alt="Encountive mark as contemporary art — two figures in navy and teal"
              className="absolute inset-0 size-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-surface/25" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-accent/20" />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="In review" value={String(review.length)} />
        <Stat label="Approved" value={String(approved.length)} />
        <Stat label="Library assets" value={String(assets.length)} />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-fg">The pipeline</h2>
            <p className="mt-1 text-sm text-muted">
              Copy, picture, type, motion, sound, then a human gate.
            </p>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((p) => (
            <li
              key={p.step}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <p className="font-mono text-[11px] text-accent">{p.step}</p>
              <p className="mt-2 text-sm font-medium text-fg">{p.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{p.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Recent campaigns</h2>
          <Link to="/campaigns" className="text-sm text-muted hover:text-fg">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.slice(0, 3).map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular text-fg">{value}</p>
    </div>
  );
}
