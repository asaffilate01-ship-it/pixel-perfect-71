import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/whatsapp/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleWhatsAppCheckoutRequest } =
          await import("@/lib/mealdeck-whatsapp-checkout.server");
        return handleWhatsAppCheckoutRequest(request, process.env);
      },
    },
  },
});
