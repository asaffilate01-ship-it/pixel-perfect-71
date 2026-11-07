import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/printer/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlePrinterConfigRequest } = await import("@/lib/mealdeck-printer-config.server");
        return handlePrinterConfigRequest(request, process.env);
      },
    },
  },
});
