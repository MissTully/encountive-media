import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Download, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/cn";
import { uploadPublicBlob } from "@/lib/media-client";
import { getStashedMix } from "@/lib/mix-audio";
import {
  disconnectAccount,
  listPublishJobs,
  listSocialAccounts,
  oauthStatus,
  queuePublish,
  type PublishJob,
  type SocialAccount,
} from "@/lib/publish";
import { useStudio } from "@/lib/store";

export const Route = createFileRoute("/_studio/publish")({
  component: PublishPage,
});

function PublishPage() {
  const hydrated = useHydrated();
  const campaigns = useStudio((s) => s.campaigns);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [oauth, setOauth] = useState({
    linkedin: false,
    instagram: false,
    supabase: false,
    supabaseError: null as string | null,
    database: "preview" as "supabase" | "postgres" | "preview",
  });
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<{ linkedin: boolean; instagram: boolean }>({
    linkedin: true,
    instagram: true,
  });
  const [asVideo, setAsVideo] = useState(true);
  const [busy, setBusy] = useState(false);
  const campaign = campaigns.find((c) => c.id === campaignId) ?? campaigns[0];
  const caption = campaign?.caption ?? "";
  const motionReady = campaign?.motion?.status === "ready" && Boolean(campaign.motion?.videoUrl || campaign.motion?.mixedUrl);
  const cover = campaign?.slides[0];

  async function refresh() {
    try {
      const [a, j, o] = await Promise.all([
        listSocialAccounts(),
        listPublishJobs(),
        oauthStatus(),
      ]);
      setAccounts(a);
      setJobs(j);
      setOauth(o);
    } catch {
      // signed out
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("oauth");
    if (!q) return;
    if (q.endsWith("-ok")) toast.success("Channel connected.");
    else if (q.startsWith("missing")) toast.error("App credentials for this channel are not set on deploy yet.");
    else toast.error("Could not finish connecting that channel.");
    void refresh();
  }, []);

  async function publicImage(): Promise<string | undefined> {
    if (!cover?.imageUrl) return undefined;
    if (cover.imageUrl.startsWith("http")) return cover.imageUrl;
    if (cover.imageUrl.startsWith("data:")) {
      const blob = await (await fetch(cover.imageUrl)).blob();
      const up = await uploadPublicBlob(blob, "cover.jpg");
      if (up.ok) return up.publicUrl;
      return cover.imageUrl;
    }
    return `${window.location.origin}${cover.imageUrl}`;
  }

  async function blobFromCover(): Promise<string | undefined> {
    if (!cover?.imageUrl) return undefined;
    if (cover.imageUrl.startsWith("data:")) return cover.imageUrl;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = cover.imageUrl.startsWith("http")
      ? cover.imageUrl
      : cover.imageUrl;
    await new Promise((r, j) => {
      img.onload = r;
      img.onerror = j;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  async function publicVideo(): Promise<string | undefined> {
    if (!campaign) return undefined;
    const stashed = getStashedMix(campaign.id);
    if (stashed) {
      const ext = stashed.blob.type.includes("mp4") ? "mp4" : "webm";
      const up = await uploadPublicBlob(stashed.blob, `${campaign.id}-mix.${ext}`);
      if (!up.ok) throw new Error(up.error);
      return up.publicUrl;
    }
    const url = campaign.motion?.mixedUrl || campaign.motion?.videoUrl;
    if (!url) return undefined;
    if (url.startsWith("http")) return url;
    if (url.startsWith("blob:")) {
      const blob = await (await fetch(url)).blob();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const up = await uploadPublicBlob(blob, `${campaign.id}-clip.${ext}`);
      if (!up.ok) throw new Error(up.error);
      return up.publicUrl;
    }
    return `${window.location.origin}${url}`;
  }

  async function onPublish() {
    if (!campaign) return;
    const targets = (["linkedin", "instagram"] as const).filter((p) => platforms[p]);
    if (!targets.length) {
      toast.error("Pick at least one channel.");
      return;
    }
    setBusy(true);
    try {
      const wantVideo = asVideo && motionReady;
      let videoUrl: string | undefined;
      if (wantVideo) {
        try {
          videoUrl = await publicVideo();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not host the video. Connect Supabase, then retry.");
          setBusy(false);
          return;
        }
      }
      const image = await publicImage();
      const linkedinStill = await blobFromCover().catch(() => image);

      for (const platform of targets) {
        const res = await queuePublish({
          data: {
            campaignId: campaign.id,
            campaignTitle: campaign.title,
            platform,
            kind: wantVideo ? "video" : "carousel",
            caption: campaign.caption,
            imageDataUrl: platform === "linkedin" ? linkedinStill : undefined,
            imageUrl: image,
            videoUrl: wantVideo ? videoUrl : undefined,
          },
        });
        if (res.ok) toast.success(`Posted to ${platform}.`);
        else toast.error(`${platform}: ${res.error}`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function downloadPack() {
    if (!campaign) return;
    const blob = new Blob(
      [`${campaign.title}\n\n${campaign.caption}\n\nCTA: ${campaign.cta}\n`],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${campaign.title.replace(/\s+/g, "-").toLowerCase()}-caption.txt`;
    a.click();
    toast.success("Caption downloaded. Export slides as PNG from the campaign.");
  }

  const linkedin = accounts.find((a) => a.platform === "linkedin");
  const instagram = accounts.find((a) => a.platform === "instagram");

  if (!hydrated) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Publish</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Push an approved campaign to LinkedIn and Instagram. Mix soundtrack
          first if you want music or VO on the clip. Nothing posts until you press
          the button.
        </p>
      </div>

      <SignedOut>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-display text-xl">Sign in to connect channels</p>
          <p className="mt-1 text-sm text-muted">
            LinkedIn, Instagram, and Supabase tokens are stored per account.
          </p>
          <Button asChild className="mt-4">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </SignedOut>

      <SignedIn>
        <section className="grid gap-3 sm:grid-cols-3">
          <ChannelCard
            name="LinkedIn"
            connected={Boolean(linkedin?.connected)}
            account={linkedin?.accountName}
            configured={oauth.linkedin}
            href="/api/oauth/linkedin"
            onDisconnect={() =>
              disconnectAccount({ data: { platform: "linkedin" } }).then(refresh)
            }
          />
          <ChannelCard
            name="Instagram"
            connected={Boolean(instagram?.connected)}
            account={instagram?.accountName}
            configured={oauth.instagram}
            href="/api/oauth/instagram"
            onDisconnect={() =>
              disconnectAccount({ data: { platform: "instagram" } }).then(refresh)
            }
          />
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Supabase</p>
            <p className="mt-2 font-display text-2xl">{oauth.supabase ? "Connected" : "Not connected"}</p>
            <p className="mt-1 text-sm text-muted">
              {oauth.supabase
                ? `Storage is live. Database: ${oauth.database}.`
                : "Hosts mixed video so Instagram and LinkedIn can fetch it. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on deploy, then run the SQL in supabase/schema.sql."}
            </p>
            {oauth.supabaseError && !oauth.supabase ? (
              <p className="mt-2 text-xs text-danger">{oauth.supabaseError}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl">Send a campaign</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign</Label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-elevated px-3 text-sm"
                  value={campaign?.id ?? ""}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {c.status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                {(["linkedin", "instagram"] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={platforms[p]}
                      onChange={(e) =>
                        setPlatforms((s) => ({ ...s, [p]: e.target.checked }))
                      }
                    />
                    {p}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={asVideo && motionReady}
                    disabled={!motionReady}
                    onChange={(e) => setAsVideo(e.target.checked)}
                  />
                  Post video{campaign?.motion?.mixedUrl ? " (with mix)" : ""}
                </label>
              </div>
              <Textarea rows={6} readOnly value={caption} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !campaign} onClick={onPublish}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Publish
                </Button>
                <Button variant="secondary" onClick={downloadPack}>
                  <Download className="size-4" />
                  Caption pack
                </Button>
                {campaign ? (
                  <Button asChild variant="ghost">
                    <Link to="/campaigns/$id" params={{ id: campaign.id }}>
                      Open campaign
                    </Link>
                  </Button>
                ) : null}
              </div>
              {!oauth.supabase && asVideo && motionReady ? (
                <p className="text-xs text-muted">
                  Video publish needs Supabase storage so Meta and LinkedIn can
                  fetch the file. Stills can still go to LinkedIn without it.
                </p>
              ) : null}
            </div>
            {cover?.imageUrl ? (
              <img src={cover.imageUrl} alt="" className="aspect-square w-full rounded-lg object-cover" />
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl">Queue</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted">Nothing sent yet.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm"
                >
                  <span>
                    {j.campaignTitle} · {j.platform} · {j.kind}
                  </span>
                  <span
                    className={cn(
                      "text-xs uppercase tracking-wider",
                      j.status === "posted"
                        ? "text-ok"
                        : j.status === "failed" || j.status === "needs-connection"
                          ? "text-danger"
                          : "text-muted",
                    )}
                  >
                    {j.status}
                  </span>
                  {j.error ? <span className="w-full text-xs text-danger">{j.error}</span> : null}
                  {j.postedUrl ? (
                    <a href={j.postedUrl} className="text-xs text-accent" target="_blank" rel="noreferrer">
                      Open post
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </SignedIn>
    </div>
  );
}

function ChannelCard({
  name,
  connected,
  account,
  configured,
  href,
  onDisconnect,
}: {
  name: string;
  connected: boolean;
  account?: string | null;
  configured: boolean;
  href: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{name}</p>
      <p className="mt-2 font-display text-2xl">{connected ? "Connected" : "Not connected"}</p>
      <p className="mt-1 text-sm text-muted">
        {connected
          ? account || "Ready to post"
          : configured
            ? "Authorize this channel to push live."
            : "Add app credentials on deploy, then connect. Until then, download a pack."}
      </p>
      <div className="mt-4 flex gap-2">
        {connected ? (
          <Button size="sm" variant="secondary" onClick={onDisconnect}>
            <Unplug className="size-3.5" />
            Disconnect
          </Button>
        ) : (
          <Button size="sm" asChild>
            <a href={href}>{configured ? "Connect" : "Try connect"}</a>
          </Button>
        )}
      </div>
    </div>
  );
}
