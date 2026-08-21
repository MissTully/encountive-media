export type Audience =
  | "nursing-programs"
  | "hospital-systems"
  | "sim-centers"
  | "workforce";

export type Channel = "linkedin" | "instagram" | "stories" | "youtube";

export type SlideLayout = "cover" | "photo" | "stat" | "quote" | "close";

export type CampaignStatus =
  | "draft"
  | "generating"
  | "review"
  | "changes"
  | "approved";

export type MotionStatus = "idle" | "rendering" | "ready" | "failed";

export interface Slide {
  id: string;
  kicker: string;
  headline: string;
  body: string;
  layout: SlideLayout;
  visualPrompt: string;
  imageUrl: string;
  statValue?: string;
  statLabel?: string;
}

export interface MotionClip {
  id: string;
  prompt: string;
  sourceSlideId?: string;
  videoUrl?: string;
  originalUrl?: string;
  mixedUrl?: string;
  mixLabel?: string;
  posterUrl?: string;
  status: MotionStatus;
  requestId?: string;
  duration: 6 | 10;
  aspectRatio: "16:9" | "9:16" | "1:1";
  error?: string;
}

export interface Campaign {
  id: string;
  title: string;
  brief: string;
  audience: Audience;
  channel: Channel;
  cta: string;
  caption: string;
  slides: Slide[];
  motion?: MotionClip;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface LibraryAsset {
  id: string;
  title: string;
  kind: "still" | "motion" | "brand";
  url: string;
  originalUrl?: string;
  mixedUrl?: string;
  posterUrl?: string;
  tags: string[];
  prompt?: string;
}

export const AUDIENCES: { id: Audience; label: string; blurb: string }[] = [
  {
    id: "nursing-programs",
    label: "Nursing programs",
    blurb: "Deans, faculty, simulation directors",
  },
  {
    id: "hospital-systems",
    label: "Hospital systems",
    blurb: "CNOs, educators, quality leaders",
  },
  {
    id: "sim-centers",
    label: "Clinical training centers",
    blurb: "Sim center directors and staff",
  },
  {
    id: "workforce",
    label: "Workforce development",
    blurb: "Health-system L&D and residency",
  },
];

export const CHANNELS: {
  id: Channel;
  label: string;
  aspect: string;
  hint: string;
}[] = [
  {
    id: "linkedin",
    label: "LinkedIn carousel",
    aspect: "1 / 1",
    hint: "6–8 square slides",
  },
  {
    id: "instagram",
    label: "Instagram",
    aspect: "4 / 5",
    hint: "Portrait feed",
  },
  {
    id: "stories",
    label: "Stories / Reels",
    aspect: "9 / 16",
    hint: "Vertical motion + stills",
  },
  {
    id: "youtube",
    label: "YouTube / video",
    aspect: "16 / 9",
    hint: "Landscape motion",
  },
];

export function channelAspect(channel: Channel): string {
  return CHANNELS.find((c) => c.id === channel)?.aspect ?? "1 / 1";
}

export function statusLabel(status: CampaignStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "generating":
      return "Generating";
    case "review":
      return "In review";
    case "changes":
      return "Changes requested";
    case "approved":
      return "Approved";
  }
}
