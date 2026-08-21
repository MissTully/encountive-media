import { Badge } from "@/components/ui/badge";
import { statusLabel, type CampaignStatus } from "@/lib/types";

const TONE: Record<CampaignStatus, "muted" | "accent" | "ok" | "warn" | "danger"> = {
  draft: "muted",
  generating: "accent",
  review: "warn",
  changes: "danger",
  approved: "ok",
};

export function StatusChip({ status }: { status: CampaignStatus }) {
  return <Badge tone={TONE[status]}>{statusLabel(status)}</Badge>;
}
