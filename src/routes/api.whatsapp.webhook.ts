import { createFileRoute } from "@tanstack/react-router";
async function handle(request: Request) {
  const { handleWhatsAppWebhook } = await import("@/lib/mealdeck-whatsapp.server");
  return handleWhatsAppWebhook(request, process.env);
}
export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
