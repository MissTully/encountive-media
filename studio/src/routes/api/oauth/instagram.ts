import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/instagram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleInstagramOAuth } = await import("@/lib/oauth-instagram.server");
        return handleInstagramOAuth(request);
      },
    },
  },
});
