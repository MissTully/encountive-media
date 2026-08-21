import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED_ASSETS, SEED_CAMPAIGNS } from "./seed";
import type {
  Campaign,
  CampaignStatus,
  LibraryAsset,
  MotionClip,
  Slide,
} from "./types";

interface StudioState {
  campaigns: Campaign[];
  assets: LibraryAsset[];
  upsertCampaign: (campaign: Campaign) => void;
  patchCampaign: (id: string, patch: Partial<Campaign>) => void;
  patchSlide: (campaignId: string, slideId: string, patch: Partial<Slide>) => void;
  setStatus: (id: string, status: CampaignStatus, notes?: string) => void;
  setMotion: (id: string, motion: MotionClip) => void;
  addAsset: (asset: LibraryAsset) => void;
  patchAsset: (id: string, patch: Partial<LibraryAsset>) => void;
  removeCampaign: (id: string) => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      campaigns: SEED_CAMPAIGNS,
      assets: SEED_ASSETS,
      upsertCampaign: (campaign) =>
        set((s) => {
          const i = s.campaigns.findIndex((c) => c.id === campaign.id);
          const campaigns =
            i === -1
              ? [campaign, ...s.campaigns]
              : s.campaigns.map((c, idx) => (idx === i ? campaign : c));
          return { campaigns };
        }),
      patchCampaign: (id, patch) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
          ),
        })),
      patchSlide: (campaignId, slideId, patch) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id !== campaignId
              ? c
              : {
                  ...c,
                  updatedAt: new Date().toISOString(),
                  slides: c.slides.map((sl) =>
                    sl.id === slideId ? { ...sl, ...patch } : sl,
                  ),
                },
          ),
        })),
      setStatus: (id, status, notes) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status,
                  notes: notes ?? c.notes,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        })),
      setMotion: (id, motion) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id
              ? { ...c, motion, updatedAt: new Date().toISOString() }
              : c,
          ),
        })),
      addAsset: (asset) =>
        set((s) => ({
          assets: [asset, ...s.assets.filter((a) => a.id !== asset.id)],
        })),
      patchAsset: (id, patch) =>
        set((s) => ({
          assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeCampaign: (id) =>
        set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),
    }),
    { name: "encountive-studio-v1" },
  ),
);

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
