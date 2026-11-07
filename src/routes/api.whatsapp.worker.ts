import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/whatsapp/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleWhatsAppWorker } = await import("@/lib/mealdeck-whatsapp.server");
        return handleWhatsAppWorker(request, process.env);
      },
    },
  },
});
