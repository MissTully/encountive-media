import { Link } from "@tanstack/react-router";
import { StatusChip } from "@/components/status-chip";
import { AUDIENCES, CHANNELS, type Campaign } from "@/lib/types";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const cover = campaign.slides[0];
  const audience = AUDIENCES.find((a) => a.id === campaign.audience)?.label;
  const channel = CHANNELS.find((c) => c.id === campaign.channel)?.label;

  return (
    <Link
      to="/campaigns/$id"
      params={{ id: campaign.id }}
      className="group block overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,transform] duration-200 hover:border-muted"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-elevated">
        {cover?.imageUrl ? (
          <img
            src={cover.imageUrl}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
        <div className="absolute left-3 top-3">
          <StatusChip status={campaign.status} />
        </div>
        <p className="absolute bottom-3 left-3 right-3 font-display text-lg leading-snug text-fg">
          {campaign.title}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted">
        <span>
          {audience} · {channel}
        </span>
        <span className="tabular">
          {campaign.slides.length} slides
          {campaign.motion?.status === "ready" ? " · motion" : ""}
        </span>
      </div>
    </Link>
  );
}
