import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { BRAND } from "./brand";
import type { Audience, Channel, SlideLayout } from "./types";

const SYSTEM = `You are the in-house copy lead for Encountive, an AI-adaptive clinical simulation company for healthcare.

Product: ${BRAND.product}
Mechanism: ${BRAND.loop} Powered by ${BRAND.engine}.
Voice:
- ${BRAND.voice.join("\n- ")}

Approved facts (use these numbers; do not invent new percentages):
${BRAND.facts.map((f) => `- ${f.value} — ${f.label} (${f.source})`).join("\n")}

Approved claims:
- ${BRAND.claimsOk.join("\n- ")}

Never say:
- ${BRAND.claimsNo.join("\n- ")}

Write like a clinical educator who also understands LinkedIn. Short sentences. Concrete nouns. No hype adjectives (revolutionary, magical, seamless, unlock, supercharge). No emoji.

Return ONLY valid JSON.`;

export type GeneratedDeck = {
  title: string;
  caption: string;
  cta: string;
  motionPrompt: string;
  slides: {
    kicker: string;
    headline: string;
    body: string;
    layout: SlideLayout;
    visualPrompt: string;
    statValue?: string;
    statLabel?: string;
  }[];
};

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

async function grokJson(user: string): Promise<unknown> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("AI is not available in this environment");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`xAI chat error ${res.status}${err ? `: ${err.slice(0, 180)}` : ""}`);
  }
  const body = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const text = body.choices[0]?.message.content ?? "";
  return extractJson(text);
}

export const writeCampaign = createServerFn({ method: "POST" })
  .validator(
    (input: { brief: string; audience: Audience; channel: Channel; goal: string }) =>
      input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; deck: GeneratedDeck } | { ok: false; error: string }> => {
    try {
      const slideCount =
        data.channel === "stories" ? 4 : data.channel === "youtube" ? 3 : 6;
      const raw = await grokJson(`Write a ${slideCount}-slide ${data.channel} campaign.

Audience: ${data.audience}
Goal: ${data.goal || "Book a scoped 60–90 day pilot"}
Brief:
${data.brief}

JSON shape:
{
  "title": "short internal title",
  "caption": "social caption, 3-6 short lines, hashtags last",
  "cta": "button-length CTA",
  "motionPrompt": "one present-tense 6s shot for Imagine video, camera move included, no text in the scene",
  "slides": [
    {
      "kicker": "2-5 words",
      "headline": "max 12 words, concrete",
      "body": "1-2 sentences",
      "layout": "cover|photo|stat|quote|close",
      "visualPrompt": "photoreal healthcare still, NO text, NO logos, NO lettering, navy-teal grade",
      "statValue": "optional, only for layout=stat",
      "statLabel": "optional"
    }
  ]
}

Slide 1 must be layout cover. Last slide must be layout close. Include at most two stat slides. visualPrompt describes a photograph with empty space for overlay type — never include words in the image.`);
      const deck = raw as GeneratedDeck;
      if (!deck?.slides?.length) throw new Error("Empty deck");
      return { ok: true, deck };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Copy failed" };
    }
  });

export const rewriteSlide = createServerFn({ method: "POST" })
  .validator(
    (input: {
      instruction: string;
      kicker: string;
      headline: string;
      body: string;
      layout: SlideLayout;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; kicker: string; headline: string; body: string } | { ok: false; error: string }> => {
    try {
      const raw = await grokJson(`Rewrite this carousel slide.
Instruction: ${data.instruction}
Current kicker: ${data.kicker}
Current headline: ${data.headline}
Current body: ${data.body}
Layout: ${data.layout}

JSON: { "kicker": "", "headline": "", "body": "" }
Keep headline ≤ 12 words. Do not invent stats.`);
      const out = raw as { kicker: string; headline: string; body: string };
      return { ok: true, kicker: out.kicker, headline: out.headline, body: out.body };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Rewrite failed" };
    }
  });

export const generateStill = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; aspectRatio: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };
    try {
      const res = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-imagine-image-2.0",
          prompt: `${data.prompt}. Photoreal cinematic healthcare photography, navy and tidal-teal color grade, no text, no logos, no watermarks, no lettering, no UI words.`,
          aspect_ratio: data.aspectRatio,
          resolution: "1k",
          response_format: "b64_json",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `Imagine image error ${res.status}: ${err.slice(0, 180)}` };
      }
      const body = (await res.json()) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const first = body.data?.[0];
      if (first?.b64_json) {
        return { ok: true, dataUrl: `data:image/png;base64,${first.b64_json}` };
      }
      if (first?.url) return { ok: true, dataUrl: first.url };
      return { ok: false, error: "Imagine returned no image" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image failed" };
    }
  });

export const startMotion = createServerFn({ method: "POST" })
  .validator(
    (input: {
      prompt: string;
      imageDataUrl?: string;
      duration: 6 | 10;
      aspectRatio: "16:9" | "9:16" | "1:1";
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };
    try {
      const payload: Record<string, unknown> = {
        model: "grok-imagine-video-1.5",
        prompt: data.prompt,
        duration: data.duration,
        aspect_ratio: data.aspectRatio,
        resolution: "720p",
      };
      if (data.imageDataUrl) {
        payload.image = { url: data.imageDataUrl, type: "image_url" };
      }
      const res = await fetch("https://api.x.ai/v1/videos/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `Imagine video error ${res.status}: ${err.slice(0, 220)}` };
      }
      const body = (await res.json()) as { request_id?: string };
      if (!body.request_id) return { ok: false, error: "No request id from Imagine" };
      return { ok: true, requestId: body.request_id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Video start failed" };
    }
  });

export const pollMotion = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<
    | { ok: true; status: "pending" | "done" | "failed" | "expired"; url?: string; error?: string }
    | { ok: false; error: string }
  > => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };
    try {
      const res = await fetch(`https://api.x.ai/v1/videos/${data.requestId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `Poll error ${res.status}: ${err.slice(0, 180)}` };
      }
      const body = (await res.json()) as {
        status?: string;
        video?: { url?: string };
        error?: { message?: string };
      };
      const status = (body.status ?? "pending") as "pending" | "done" | "failed" | "expired";
      if (status === "done") {
        return { ok: true, status, url: body.video?.url };
      }
      if (status === "failed" || status === "expired") {
        return { ok: true, status, error: body.error?.message ?? status };
      }
      return { ok: true, status: "pending" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Poll failed" };
    }
  });

export const fetchPublicAsDataUrl = createServerFn({ method: "POST" })
  .validator((input: { path: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> => {
    try {
      if (data.path.startsWith("data:")) return { ok: true, dataUrl: data.path };
      if (data.path.startsWith("http")) {
        const res = await fetch(data.path);
        if (!res.ok) return { ok: false, error: "Could not fetch source still" };
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get("content-type") ?? "image/jpeg";
        return { ok: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
      }
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const file = join(process.cwd(), "public", data.path.replace(/^\//, ""));
      const buf = await readFile(file);
      const mime = file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".mp4")
          ? "video/mp4"
          : file.endsWith(".mp3")
            ? "audio/mpeg"
            : file.endsWith(".wav")
              ? "audio/wav"
              : "image/jpeg";
      return { ok: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    } catch {
      return { ok: false, error: "Could not read source still" };
    }
  });

export const writeVoiceover = createServerFn({ method: "POST" })
  .validator((input: { caption: string; title: string; seconds: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; script: string } | { ok: false; error: string }> => {
    try {
      const raw = await grokJson(`Write a ${data.seconds}-second voiceover for this Encountive campaign.
Title: ${data.title}
Caption:
${data.caption}

JSON: { "script": "..." }
The script must be speakable in about ${data.seconds} seconds (roughly ${Math.round(data.seconds * 2.4)} words). Calm, specific, no hype, no emoji. Do not invent stats.`);
      const out = raw as { script: string };
      if (!out?.script) throw new Error("Empty script");
      return { ok: true, script: out.script };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Voiceover failed" };
    }
  });

export const synthesizeNarration = createServerFn({ method: "POST" })
  .validator((input: { text: string; voiceId: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available in this environment" };
    const text = data.text.trim().slice(0, 1200);
    if (!text) return { ok: false, error: "Write narration first." };
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text,
          voice_id: data.voiceId || "eve",
          language: "en",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `Voice error ${res.status}: ${err.slice(0, 180)}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type") || "audio/mpeg";
      return { ok: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Narration failed" };
    }
  });
