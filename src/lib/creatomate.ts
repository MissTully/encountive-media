// The one reusable Creatomate render sub-flow (build-spec constraint 3.4:
// "Build one reusable polling sub-flow and reuse it"): submit a source →
// poll the job → fetch the finished bytes. Used by both the carousel slide
// renderer (src/lib/carousel.ts) and the video renderer (src/lib/video.ts).

export function hasCreatomateKey(): boolean {
  return Boolean(process.env.CREATOMATE_API_KEY);
}

/**
 * The shared slide/clip composition, so still slides, video clips, and the
 * in-app preview (src/components/video-preview.tsx) all agree on layout:
 * background photo with a dark overlay for text contrast, 72px Inter headline
 * bottom-anchored above 42%, 38px body top-anchored below 48% — authored at
 * 1080-wide scale. The overlay is only applied when there is text to protect;
 * a caption-less clip shows the photo untouched.
 */
export function slideElements(spec: {
  imageUrl: string;
  headline: string | null;
  bodyCopy: string | null;
  /** canvasWidth / 1080 — scales the caption sizes to the output canvas. */
  fontScale?: number;
}): Array<Record<string, unknown>> {
  const fontScale = spec.fontScale ?? 1;
  const hasText = Boolean(spec.headline || spec.bodyCopy);
  const elements: Array<Record<string, unknown>> = [
    {
      type: "image",
      source: spec.imageUrl,
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
      fit: "cover",
      ...(hasText ? { color_overlay: "rgba(0,0,0,0.45)" } : {}),
    },
  ];
  if (spec.headline) {
    elements.push({
      type: "text",
      text: spec.headline,
      x: "50%",
      y: "42%",
      width: "84%",
      x_alignment: "50%",
      y_alignment: "100%",
      font_family: "Inter",
      font_weight: "700",
      font_size: `${Math.round(72 * fontScale)} px`,
      fill_color: "#ffffff",
    });
  }
  if (spec.bodyCopy) {
    elements.push({
      type: "text",
      text: spec.bodyCopy,
      x: "50%",
      y: "48%",
      width: "78%",
      x_alignment: "50%",
      y_alignment: "0%",
      font_family: "Inter",
      font_weight: "400",
      font_size: `${Math.round(38 * fontScale)} px`,
      fill_color: "#f4f4f5",
    });
  }
  return elements;
}

/**
 * Submit an inline Creatomate source, poll until it finishes, and return the
 * output bytes. `pollDeadlineMs` bounds the wait (stills finish in seconds;
 * videos can take minutes).
 */
export async function runCreatomateRender(
  source: Record<string, unknown>,
  pollDeadlineMs: number,
): Promise<Uint8Array> {
  const apiKey = process.env.CREATOMATE_API_KEY!;

  const submitRes = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source }),
  });
  if (!submitRes.ok) {
    throw new Error(
      `Creatomate submit failed (${submitRes.status}): ${(await submitRes.text()).slice(0, 300)}`,
    );
  }
  const renders = (await submitRes.json()) as Array<{
    id: string;
    status: string;
    url?: string;
  }>;
  let render = renders[0];
  if (!render) throw new Error("Creatomate returned no render job");

  const deadline = Date.now() + pollDeadlineMs;
  while (render.status !== "succeeded") {
    if (render.status === "failed") throw new Error("Creatomate render failed");
    if (Date.now() > deadline) throw new Error("Creatomate render timed out");
    await new Promise((r) => setTimeout(r, 2500));
    const pollRes = await fetch(
      `https://api.creatomate.com/v1/renders/${render.id}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!pollRes.ok) {
      throw new Error(`Creatomate poll failed (${pollRes.status})`);
    }
    render = (await pollRes.json()) as typeof render;
  }
  if (!render.url) throw new Error("Creatomate finished without an output URL");

  const fileRes = await fetch(render.url);
  if (!fileRes.ok) {
    throw new Error(`fetching render output failed (${fileRes.status})`);
  }
  return new Uint8Array(await fileRes.arrayBuffer());
}
