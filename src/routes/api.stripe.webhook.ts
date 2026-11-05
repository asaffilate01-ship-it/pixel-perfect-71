import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMealDeckStripeWebhook } =
          await import("@/lib/mealdeck-online-checkout.server");
        return handleMealDeckStripeWebhook(request, process.env);
      },
    },
  },
});
