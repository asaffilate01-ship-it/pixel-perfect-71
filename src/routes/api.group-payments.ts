import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { handleSharedPaymentsRequest } = await import("@/lib/mealdeck-shared-payments.server");
  return handleSharedPaymentsRequest(request, process.env);
}

export const Route = createFileRoute("/api/group-payments")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
