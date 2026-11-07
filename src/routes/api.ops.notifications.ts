import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/ops/notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleNotificationCampaignRequest } =
          await import("@/lib/mealdeck-notifications.server");
        return handleNotificationCampaignRequest(request, process.env);
      },
    },
  },
});
