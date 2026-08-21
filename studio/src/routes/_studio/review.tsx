import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useStudio } from "@/lib/store";
import { AUDIENCES, CHANNELS } from "@/lib/types";

export const Route = createFileRoute("/_studio/review")({
  component: ReviewPage,
});

function ReviewPage() {
  const hydrated = useHydrated();
  const campaigns = useStudio((s) => s.campaigns);
  const setStatus = useStudio((s) => s.setStatus);
  const queue = campaigns.filter(
    (c) => c.status === "review" || c.status === "changes" || c.status === "draft",
  );
  const approved = campaigns.filter((c) => c.status === "approved");

  if (!hydrated) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Review</h1>
        <p className="mt-1 text-sm text-muted">
          Human approval is still mandatory. Imagine does not publish.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Nothing waiting. New campaigns land here after Grok drafts them.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.map((c) => {
            const cover = c.slides[0];
            return (
              <li
                key={c.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center"
              >
                <Link
                  to="/campaigns/$id"
                  params={{ id: c.id }}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div className="size-20 shrink-0 overflow-hidden rounded-md bg-elevated">
                    {cover?.imageUrl ? (
                      <img src={cover.imageUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-fg">{c.title}</p>
                      <StatusChip status={c.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {AUDIENCES.find((a) => a.id === c.audience)?.label} ·{" "}
                      {CHANNELS.find((ch) => ch.id === c.channel)?.label} ·{" "}
                      {c.slides.length} slides
                    </p>
                    {c.notes ? (
                      <p className="mt-1 truncate text-xs text-danger">{c.notes}</p>
                    ) : null}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStatus(c.id, "changes", c.notes || "Needs another pass.");
                      toast.message("Sent back for changes.");
                    }}
                  >
                    <MessageSquare className="size-3.5" />
                    Changes
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setStatus(c.id, "approved");
                      toast.success("Approved.");
                    }}
                  >
                    <Check className="size-3.5" />
                    Approve
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {approved.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-xl text-fg">Approved</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {approved.map((c) => (
              <li key={c.id}>
                <Link
                  to="/campaigns/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:border-muted"
                >
                  <div className="size-14 overflow-hidden rounded-md bg-elevated">
                    {c.slides[0]?.imageUrl ? (
                      <img
                        src={c.slides[0].imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm text-fg">{c.title}</p>
                    <p className="text-xs text-muted">Ready to publish</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
