import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/marketplace/bridge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMarketplaceBridgeRequest } =
          await import("@/lib/mealdeck-marketplace-bridge.server");
        return handleMarketplaceBridgeRequest(request, process.env);
      },
    },
  },
});
