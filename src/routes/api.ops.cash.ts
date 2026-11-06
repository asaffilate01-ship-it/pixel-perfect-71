import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ops/cash")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCashOrdersRequest } = await import("@/lib/mealdeck-cash-orders.server");
        return handleCashOrdersRequest(request, process.env);
      },
    },
  },
});
