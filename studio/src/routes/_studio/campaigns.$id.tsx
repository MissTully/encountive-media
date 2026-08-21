import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toPng } from "html-to-image";
import {
  ArrowLeft,
  Check,
  Download,
  Film,
  ImagePlus,
  Loader2,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AudioMixer } from "@/components/audio-mixer";
import { SlideCanvas } from "@/components/slide-canvas";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPublicAsDataUrl,
  generateStill,
  pollMotion,
  rewriteSlide,
  startMotion,
} from "@/lib/ai";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/hooks/use-hydrated";
import { uid, useStudio } from "@/lib/store";
import { AUDIENCES, CHANNELS } from "@/lib/types";

export const Route = createFileRoute("/_studio/campaigns/$id")({
  component: CampaignWorkspace,
});

function CampaignWorkspace() {
  const { id } = Route.useParams();
  const hydrated = useHydrated();
  const campaign = useStudio((s) => s.campaigns.find((c) => c.id === id));
  const patchCampaign = useStudio((s) => s.patchCampaign);
  const patchSlide = useStudio((s) => s.patchSlide);
  const setStatus = useStudio((s) => s.setStatus);
  const setMotion = useStudio((s) => s.setMotion);
  const addAsset = useStudio((s) => s.addAsset);

  const [active, setActive] = useState(0);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteNote, setRewriteNote] = useState("Tighter. Fewer words.");
  const [busyStill, setBusyStill] = useState(false);
  const [busyCopy, setBusyCopy] = useState(false);
  const [busyMotion, setBusyMotion] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(0);
  }, [id]);

  useEffect(() => {
    const requestId = campaign?.motion?.requestId;
    if (!campaign || campaign.motion?.status !== "rendering" || !requestId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await pollMotion({ data: { requestId } });
      if (cancelled || !res.ok) return;
      if (res.status === "done" && res.url) {
        setMotion(campaign.id, {
          ...campaign.motion!,
          status: "ready",
          videoUrl: res.url,
          originalUrl: res.url,
        });
        addAsset({
          id: uid("ast"),
          title: `${campaign.title} — motion`,
          kind: "motion",
          url: res.url,
          posterUrl: campaign.slides[0]?.imageUrl,
          tags: ["motion", "generated"],
          prompt: campaign.motion?.prompt,
        });
        toast.success("Motion is ready.");
        setBusyMotion(false);
        return;
      }
      if (res.status === "failed" || res.status === "expired") {
        setMotion(campaign.id, {
          ...campaign.motion!,
          status: "failed",
          error: res.error,
        });
        toast.error(res.error ?? "Motion failed");
        setBusyMotion(false);
        return;
      }
      window.setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, campaign?.motion?.status, campaign?.motion?.requestId]);

  if (!hydrated) {
    return <Skeleton className="h-[70vh] rounded-xl" />;
  }

  if (!campaign) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-2xl">Campaign not found.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  const slide = campaign.slides[active] ?? campaign.slides[0];
  const audience = AUDIENCES.find((a) => a.id === campaign.audience)?.label;
  const channel = CHANNELS.find((c) => c.id === campaign.channel)?.label;
  const current = campaign;

  async function exportPng() {
    if (!canvasRef.current) return;
    try {
      const dataUrl = await toPng(canvasRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${current.title.replace(/\s+/g, "-").toLowerCase()}-slide-${active + 1}.png`;
      a.click();
    } catch {
      toast.error("Export failed. Try again.");
    }
  }

  async function onRewrite() {
    if (!slide) return;
    setBusyCopy(true);
    const res = await rewriteSlide({
      data: {
        instruction: rewriteNote,
        kicker: slide.kicker,
        headline: slide.headline,
        body: slide.body,
        layout: slide.layout,
      },
    });
    setBusyCopy(false);
    setRewriteOpen(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    patchSlide(current.id, slide.id, {
      kicker: res.kicker,
      headline: res.headline,
      body: res.body,
    });
    toast.success("Copy updated.");
  }

  async function onStill() {
    if (!slide) return;
    setBusyStill(true);
    const aspect =
      current.channel === "stories"
        ? "9:16"
        : current.channel === "youtube"
          ? "16:9"
          : "1:1";
    const res = await generateStill({
      data: { prompt: slide.visualPrompt, aspectRatio: aspect },
    });
    setBusyStill(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    patchSlide(current.id, slide.id, { imageUrl: res.dataUrl });
    addAsset({
      id: uid("ast"),
      title: `${current.title} — slide ${active + 1}`,
      kind: "still",
      url: res.dataUrl,
      tags: ["generated", current.audience],
      prompt: slide.visualPrompt,
    });
    toast.success("New still from Imagine.");
  }

  async function onMotion() {
    if (!slide) return;
    setBusyMotion(true);
    const src = await fetchPublicAsDataUrl({ data: { path: slide.imageUrl } });
    if (!src.ok) {
      setBusyMotion(false);
      toast.error(src.error);
      return;
    }
    const aspect =
      current.channel === "stories"
        ? "9:16"
        : current.channel === "youtube"
          ? "16:9"
          : "1:1";
    const prompt =
      current.motion?.prompt ||
      "Slow cinematic push-in, natural light, photoreal, no text.";
    const res = await startMotion({
      data: {
        prompt,
        imageDataUrl: src.dataUrl,
        duration: 6,
        aspectRatio: aspect,
      },
    });
    if (!res.ok) {
      setBusyMotion(false);
      toast.error(res.error);
      return;
    }
    setMotion(current.id, {
      id: current.motion?.id ?? uid("mot"),
      prompt,
      sourceSlideId: slide.id,
      status: "rendering",
      requestId: res.requestId,
      duration: 6,
      aspectRatio: aspect,
      posterUrl: slide.imageUrl,
    });
    toast.message("Imagine is rendering motion. This takes a minute.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            Campaigns
          </Link>
          <h1 className="mt-2 font-display text-3xl text-fg">{campaign.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {audience} · {channel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={campaign.status} />
          {campaign.status !== "approved" ? (
            <Button
              size="sm"
              onClick={() => {
                setStatus(campaign.id, "approved");
                toast.success("Approved. Ready to export.");
              }}
            >
              <Check className="size-4" />
              Approve
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setNotes(campaign.notes);
              setNotesOpen(true);
            }}
          >
            Request changes
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[540px] lg:flex-col lg:overflow-y-auto lg:pb-0">
          {campaign.slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border",
                i === active ? "border-accent" : "border-border opacity-80",
              )}
            >
              {s.imageUrl ? (
                <img src={s.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-[10px] text-muted">
                  {i + 1}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="w-full max-w-[480px] shrink-0">
          {slide ? (
            <SlideCanvas
              ref={canvasRef}
              slide={slide}
              index={active}
              total={campaign.slides.length}
              channel={campaign.channel}
              cta={campaign.cta}
            />
          ) : null}
          <p className="mt-3 text-xs text-muted">
            Type is composed in Studio. Imagine never paints the headline.
          </p>
        </div>

        <aside className="min-w-0 flex-1 space-y-4 rounded-xl border border-border bg-surface p-4">
          {slide ? (
            <>
              <div className="space-y-2">
                <Label>Kicker</Label>
                <Input
                  value={slide.kicker}
                  onChange={(e) =>
                    patchSlide(campaign.id, slide.id, { kicker: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Textarea
                  rows={2}
                  value={slide.headline}
                  onChange={(e) =>
                    patchSlide(campaign.id, slide.id, { headline: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  rows={3}
                  value={slide.body}
                  onChange={(e) =>
                    patchSlide(campaign.id, slide.id, { body: e.target.value })
                  }
                />
              </div>
              {slide.layout === "stat" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Stat</Label>
                    <Input
                      value={slide.statValue ?? ""}
                      onChange={(e) =>
                        patchSlide(campaign.id, slide.id, {
                          statValue: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={slide.statLabel ?? ""}
                      onChange={(e) =>
                        patchSlide(campaign.id, slide.id, {
                          statLabel: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyCopy}
                  onClick={() => setRewriteOpen(true)}
                >
                  <PenLine className="size-3.5" />
                  Rewrite
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyStill}
                  onClick={onStill}
                >
                  {busyStill ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-3.5" />
                  )}
                  New still
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyMotion || campaign.motion?.status === "rendering"}
                  onClick={onMotion}
                >
                  {busyMotion || campaign.motion?.status === "rendering" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Film className="size-3.5" />
                  )}
                  Animate
                </Button>
                <Button variant="secondary" size="sm" onClick={exportPng}>
                  <Download className="size-3.5" />
                  PNG
                </Button>
              </div>
            </>
          ) : null}

          {campaign.motion?.status === "ready" && campaign.motion.videoUrl ? (
            <div className="space-y-2">
              <Label>Motion</Label>
              <video
                src={campaign.motion.mixedUrl || campaign.motion.videoUrl}
                poster={campaign.motion.posterUrl}
                controls
                playsInline
                className="w-full rounded-md border border-border"
              />
              {campaign.motion.mixLabel ? (
                <p className="text-[11px] text-accent">Mix: {campaign.motion.mixLabel}</p>
              ) : (
                <p className="text-[11px] text-muted">Add music, narration, or both below.</p>
              )}
            </div>
          ) : campaign.motion?.status === "rendering" ? (
            <p className="flex items-center gap-2 text-xs text-accent">
              <Loader2 className="size-3.5 animate-spin" />
              Imagine is rendering motion…
            </p>
          ) : campaign.motion?.prompt ? (
            <p className="text-xs text-muted">
              Motion prompt: {campaign.motion.prompt}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>Caption</Label>
            <Textarea
              rows={4}
              value={campaign.caption}
              onChange={(e) => patchCampaign(campaign.id, { caption: e.target.value })}
            />
          </div>
        </aside>
      </div>

      {campaign.motion?.status === "ready" && (campaign.motion.originalUrl || campaign.motion.videoUrl) ? (
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="font-display text-xl text-fg">Soundtrack</h2>
          <p className="mt-1 text-sm text-muted">
            Music, narration, or both — each track is independent. Mix bakes the
            file this campaign will publish.
          </p>
          <div className="mt-4">
            <AudioMixer
              key={campaign.id}
              id={campaign.id}
              videoUrl={campaign.motion.originalUrl || campaign.motion.videoUrl!}
              posterUrl={campaign.motion.posterUrl}
              title={campaign.title}
              caption={campaign.caption}
              duration={campaign.motion.duration}
              onMixed={(_blob, url, label) => {
                const original = campaign.motion?.originalUrl || campaign.motion?.videoUrl;
                setMotion(campaign.id, {
                  ...campaign.motion!,
                  originalUrl: original,
                  mixedUrl: url,
                  videoUrl: url,
                  mixLabel: label,
                });
              }}
            />
          </div>
        </section>
      ) : null}

      <Dialog open={rewriteOpen} onOpenChange={setRewriteOpen}>
        <DialogContent>
          <DialogTitle>Rewrite this slide</DialogTitle>
          <DialogDescription>
            Grok will keep Encountive voice and will not invent new statistics.
          </DialogDescription>
          <Textarea
            className="mt-4"
            rows={3}
            value={rewriteNote}
            onChange={(e) => setRewriteNote(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRewriteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busyCopy} onClick={onRewrite}>
              {busyCopy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Rewrite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            Notes stay on the campaign. Status moves back to changes requested.
          </DialogDescription>
          <Textarea
            className="mt-4"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to change before this can ship?"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNotesOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setStatus(campaign.id, "changes", notes);
                setNotesOpen(false);
                toast.message("Changes requested.");
              }}
            >
              Send back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
