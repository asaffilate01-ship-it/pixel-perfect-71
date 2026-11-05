import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ops/integrations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleIntegrationStatusRequest } =
          await import("@/lib/mealdeck-integration-status.server");
        return handleIntegrationStatusRequest(request, process.env);
      },
    },
  },
});
