import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ops/marketplaces")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMarketplaceConnectionsRequest } =
          await import("@/lib/mealdeck-marketplace-connections.server");
        return handleMarketplaceConnectionsRequest(request, process.env);
      },
    },
  },
});
