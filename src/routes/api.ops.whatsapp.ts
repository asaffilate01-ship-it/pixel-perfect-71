import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/ops/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleWhatsAppOpsRequest } = await import("@/lib/mealdeck-whatsapp-ops.server");
        return handleWhatsAppOpsRequest(request, process.env);
      },
    },
  },
});
