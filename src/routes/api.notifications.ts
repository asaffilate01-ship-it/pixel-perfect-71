import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleCustomerNotificationsRequest } =
          await import("@/lib/mealdeck-notifications.server");
        return handleCustomerNotificationsRequest(request, process.env);
      },
      POST: async ({ request }) => {
        const { handleCustomerNotificationsRequest } =
          await import("@/lib/mealdeck-notifications.server");
        return handleCustomerNotificationsRequest(request, process.env);
      },
    },
  },
});
