import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/menu")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlePublicMenuRequest } = await import("@/lib/mealdeck-public-menu.server");
        return handlePublicMenuRequest(request, process.env);
      },
    },
  },
});
