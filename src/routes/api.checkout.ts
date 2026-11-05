import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { handleOnlineCheckoutRequest } = await import("@/lib/mealdeck-online-checkout.server");
  return handleOnlineCheckoutRequest(request, process.env);
}

export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
