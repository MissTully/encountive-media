import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { writeCampaign } from "@/lib/ai";
import { pickStill } from "@/lib/seed";
import { uid, useStudio } from "@/lib/store";
import {
  AUDIENCES,
  CHANNELS,
  type Audience,
  type Campaign,
  type Channel,
  type Slide,
  type SlideLayout,
} from "@/lib/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/_studio/new")({
  component: NewCampaign,
});

const BRIEFS: { label: string; audience: Audience; channel: Channel; text: string }[] = [
  {
    label: "AI readiness gap",
    audience: "nursing-programs",
    channel: "linkedin",
    text: "Thought-leadership carousel for nursing-program deans. Use the Lancet numbers (90 / 79 / under 15). Name the gap, then Encountive as the practice layer. CTA: scoped 60–90 day pilot.",
  },
  {
    label: "Hospital ROI",
    audience: "hospital-systems",
    channel: "linkedin",
    text: "CNO carousel. Lead with 4.0x ROI, $150k turnover savings, 40% faculty prep reduction, 1.3 month payback. Serious, not salesy. CTA: scoped pilot.",
  },
  {
    label: "Sim center pilot",
    audience: "sim-centers",
    channel: "linkedin",
    text: "Invite simulation-center directors to a 60–90 day pilot. Emphasize rubric-first design, exportable evidence, and that XR is coming H1 2027 — not vapor.",
  },
  {
    label: "Stories cut",
    audience: "nursing-programs",
    channel: "stories",
    text: "Vertical 4-frame story: a nurse looks up from a tablet, then three proof points, then a pilot CTA. Quiet, cinematic, no hype.",
  },
];

function NewCampaign() {
  const navigate = useNavigate();
  const upsert = useStudio((s) => s.upsertCampaign);
  const [brief, setBrief] = useState(BRIEFS[0]!.text);
  const [audience, setAudience] = useState<Audience>("nursing-programs");
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [goal, setGoal] = useState("Book a scoped 60–90 day pilot");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!brief.trim()) {
      toast.error("Write a brief first.");
      return;
    }
    setBusy(true);
    const res = await writeCampaign({
      data: { brief: brief.trim(), audience, channel, goal },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const used = new Set<string>();
    const slides: Slide[] = res.deck.slides.map((s, i) => ({
      id: uid("s"),
      kicker: s.kicker,
      headline: s.headline,
      body: s.body,
      layout: (["cover", "photo", "stat", "quote", "close"].includes(s.layout)
        ? s.layout
        : i === 0
          ? "cover"
          : "photo") as SlideLayout,
      visualPrompt: s.visualPrompt,
      imageUrl: pickStill(s.visualPrompt, i, used),
      statValue: s.statValue,
      statLabel: s.statLabel,
    }));
    const campaign: Campaign = {
      id: uid("cmp"),
      title: res.deck.title,
      brief: brief.trim(),
      audience,
      channel,
      cta: res.deck.cta,
      caption: res.deck.caption,
      slides,
      status: "draft",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      motion: {
        id: uid("mot"),
        prompt: res.deck.motionPrompt,
        status: "idle",
        duration: 6,
        aspectRatio: channel === "stories" ? "9:16" : channel === "youtube" ? "16:9" : "1:1",
        posterUrl: slides[0]?.imageUrl,
      },
    };
    upsert(campaign);
    toast.success("Deck drafted. Stills pulled from the library — generate originals per slide if you want.");
    navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl text-fg">New campaign</h1>
        <p className="mt-1 text-sm text-muted">
          Grok writes the copy against the Encountive brand kit. Imagine stills
          stay text-free; Studio composes type on top.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Start from a brief</Label>
        <div className="flex flex-wrap gap-2">
          {BRIEFS.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => {
                setBrief(b.text);
                setAudience(b.audience);
                setChannel(b.channel);
              }}
              className={cn(
                "h-9 rounded-full border px-3 text-xs",
                brief === b.text
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-fg",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder="Who is this for, what must it say, what should they do next?"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <Label>Audience</Label>
          <div className="grid gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAudience(a.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left",
                  audience === a.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted",
                )}
              >
                <p className="text-sm text-fg">{a.label}</p>
                <p className="text-xs text-muted">{a.blurb}</p>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <Label>Channel</Label>
          <div className="grid gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left",
                  channel === c.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted",
                )}
              >
                <p className="text-sm text-fg">{c.label}</p>
                <p className="text-xs text-muted">{c.hint}</p>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-2">
        <Label htmlFor="goal">Goal</Label>
        <Textarea
          id="goal"
          rows={2}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>

      <Button className="w-full sm:w-auto" size="lg" disabled={busy} onClick={generate}>
        {busy ? "Grok is writing the deck…" : "Generate campaign pack"}
      </Button>
    </div>
  );
}
