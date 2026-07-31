import { requireEnv } from "@/lib/env";

/**
 * Server-only Gemini helpers used by the in-app pipeline (the fallback for the
 * n8n workflows, and the image-generation step n8n doesn't implement yet).
 *
 * Models mirror docs/n8n-workflow-a.md and docs/n8n-workflow-c.md so both
 * pipelines produce interchangeable data:
 *  - text/vision: gemini-2.5-flash (thinking disabled for structured output —
 *    with thinking enabled the JSON gets truncated at MAX_TOKENS)
 *  - images: gemini-2.5-flash-image (the "Nano Banana" family; the spec forbids
 *    Imagen because of its planned deprecation)
 */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function callGemini(
  model: string,
  body: Record<string, unknown>,
): Promise<GeminiPart[]> {
  const apiKey = requireEnv("GOOGLE_GEMINI_API_KEY");
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`Gemini ${model} request failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }>;
  };
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error(
      `Gemini ${model} returned no content (finishReason: ${candidate?.finishReason ?? "unknown"})`,
    );
  }
  return parts;
}

/** Strips markdown code fences Gemini sometimes wraps JSON in. */
function parseJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}

export interface ImageAnalysis {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Vision auto-titling (Workflow A step 2): title, description, and tags for an
 * uploaded image. The description doubles as the input for the embedding.
 */
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
): Promise<ImageAnalysis> {
  const parts = await callGemini(TEXT_MODEL, {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          {
            text: `Analyze this image for a marketing asset library. Respond with JSON only:
{"title": "short human-friendly title (max 8 words)", "description": "2-3 sentence description of the visual content, style, and mood", "tags": ["5-10 lowercase keyword tags"]}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = parts.find((p) => p.text)?.text ?? "";
  const parsed = parseJson<Partial<ImageAnalysis>>(text);
  if (!parsed.title || !parsed.description) {
    throw new Error("Gemini vision response missing title or description");
  }
  return {
    title: String(parsed.title),
    description: String(parsed.description),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
  };
}

export interface SlideCopy {
  headline: string;
  body_copy: string;
  image_need: string;
}

/**
 * Carousel copywriting (Workflow C step 3): per slide a headline, body copy,
 * and an image-need description used to pick or generate the background.
 */
export async function writeCarouselCopy(input: {
  topic: string | null;
  brief: string | null;
  targetPlatform: string | null;
  voiceGuidelines: string | null;
  /**
   * Reviewer change requests from the previous revision (pre-formatted, one
   * slide per line with its copy and the reviewer's notes). When present the
   * rewrite is targeted: flagged slides change, the rest stay close.
   */
  revisionNotes?: string | null;
}): Promise<SlideCopy[]> {
  const { topic, brief, targetPlatform, voiceGuidelines, revisionNotes } = input;
  const parts = await callGemini(TEXT_MODEL, {
    contents: [
      {
        parts: [
          {
            text: `You are a social media copywriter. Write a ${targetPlatform ?? "social media"} image carousel of 5-7 slides.

Topic: ${topic ?? "(none)"}
Brief: ${brief ?? "(none)"}
${voiceGuidelines ? `Brand voice guidelines: ${voiceGuidelines}` : ""}
${revisionNotes ? `\nThis is a revision. The previous version and the reviewer's slide-by-slide change requests are below. Rework the flagged slides to address every request; keep unflagged slides as close to the previous version as possible.\n${revisionNotes}` : ""}

Slide 1 is a hook; the last slide is a call to action. Respond with a JSON array only, one object per slide:
[{"headline": "max 8 words", "body_copy": "1-2 short sentences", "image_need": "one sentence describing the ideal background image (subject, style, mood) — no text in the image"}]`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = parts.find((p) => p.text)?.text ?? "";
  const slides = parseJson<SlideCopy[]>(text);
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("Gemini copy response was not a non-empty JSON array");
  }
  return slides.filter((s) => s.headline && s.image_need);
}

export interface CreativeDirectorContext {
  projectName: string;
  /** One line per moodboard image: its title and description. */
  boardSummary: string | null;
  /** One line per carousel request: topic, platform, status. */
  requestsSummary: string | null;
  voiceGuidelines: string | null;
  /** Prior conversation turns, oldest first. */
  history: Array<{ role: "user" | "agent"; body: string }>;
  question: string;
}

/**
 * The Creative Director: a design agent that lives inside a project. It sees
 * the moodboard, the brand voice, and the carousels in flight, and answers
 * with concrete art direction — recommendations and step-by-step instructions
 * the user can act on in the studio.
 */
export async function askCreativeDirector(
  ctx: CreativeDirectorContext,
): Promise<string> {
  const contents = [
    ...ctx.history.map((m) => ({
      role: m.role === "agent" ? "model" : "user",
      parts: [{ text: m.body }],
    })),
    { role: "user", parts: [{ text: ctx.question }] },
  ];
  const parts = await callGemini(TEXT_MODEL, {
    systemInstruction: {
      parts: [
        {
          text: `You are the Creative Director of Encountive Media, the in-house social media marketing studio of Encountive Inc's Department of Sales & Marketing. You advise on one project at a time.

Project: ${ctx.projectName}
${ctx.voiceGuidelines ? `Brand voice guidelines: ${ctx.voiceGuidelines}` : "Brand voice guidelines: (none on file)"}
Moodboard images:
${ctx.boardSummary ?? "(the moodboard is empty)"}
Carousels in flight:
${ctx.requestsSummary ?? "(none yet)"}

The studio the user works in has these areas: Projects (moodboards + carousel briefs), Image Library (searchable shared visuals), Music Library, Video Studio (clips + music rendered to MP4), Brand Kit (voice guidelines), and this chat.

Give expert, specific design direction: visual concepts, slide structure, color/typography/mood guidance, image choices from the moodboard (refer to them by title), copy angles, and platform-specific advice. When the user needs to do something, give short numbered instructions naming the exact studio area to use. Be warm, confident, and concise — a few short paragraphs or tight lists, plain text only (no markdown syntax). If the moodboard is empty or the brief is vague, say what to gather first and recommend how.`,
        },
      ],
    },
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error("Gemini creative director response was empty");
  }
  return text;
}

/**
 * Image generation (Workflow C step 4c — the fallback when no library asset
 * clears the similarity threshold). Returns PNG bytes. The prompt forbids text
 * in the image: text is always overlaid at the render layer (spec constraint 3).
 */
export async function generateImage(imageNeed: string): Promise<Uint8Array> {
  const parts = await callGemini(IMAGE_MODEL, {
    contents: [
      {
        parts: [
          {
            text: `Generate a photographic, high-quality vertical (4:5 portrait) marketing background image: ${imageNeed}.
Absolutely no text, words, letters, logos, or typography anywhere in the image. Leave visual breathing room for a text overlay.`,
          },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  });
  const image = parts.find((p) => p.inlineData)?.inlineData;
  if (!image) {
    throw new Error("Gemini image response contained no image data");
  }
  return Uint8Array.from(Buffer.from(image.data, "base64"));
}
