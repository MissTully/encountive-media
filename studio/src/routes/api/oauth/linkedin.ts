import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/linkedin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleLinkedInOAuth } = await import("@/lib/oauth-linkedin.server");
        return handleLinkedInOAuth(request);
      },
    },
  },
});
