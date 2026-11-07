import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/notifications/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCustomerPushWorker } = await import("@/lib/mealdeck-notifications.server");
        return handleCustomerPushWorker(request, process.env);
      },
    },
  },
});
