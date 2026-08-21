import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useStudio } from "@/lib/store";

export const Route = createFileRoute("/_studio/campaigns/")({
  component: CampaignsPage,
});

function CampaignsPage() {
  const hydrated = useHydrated();
  const campaigns = useStudio((s) => s.campaigns);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-fg">Campaigns</h1>
          <p className="mt-1 text-sm text-muted">
            One brief becomes a carousel, a caption, and a motion prompt.
          </p>
        </div>
        <Button asChild>
          <Link to="/new">
            <Plus className="size-4" />
            New campaign
          </Link>
        </Button>
      </div>
      {!hydrated ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  );
}
