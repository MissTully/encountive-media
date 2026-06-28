import { requireEnv } from "@/lib/env";

/** The embedding dimension stored in assets.embedding (vector(768)). */
export const EMBEDDING_DIMS = 768;

const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Generates a 768-dim embedding for a piece of text using Google's
 * gemini-embedding-001 model. Server-only (uses the secret Gemini API key).
 *
 * The dimension and model match n8n Workflow A, so query embeddings live in the
 * same space as the asset embeddings it wrote — see docs/n8n-workflow-a.md.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = requireEnv("GOOGLE_GEMINI_API_KEY");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMS,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Gemini embedding request failed (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embedding response had no values");
  }
  return values;
}

/** True when the Gemini key needed for semantic search is configured. */
export function hasGeminiKey(): boolean {
  return Boolean(process.env.GOOGLE_GEMINI_API_KEY);
}
