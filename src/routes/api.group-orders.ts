import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { handleGroupOrdersRequest } = await import("@/lib/mealdeck-group-rooms.server");
  return handleGroupOrdersRequest(request, process.env);
}

export const Route = createFileRoute("/api/group-orders")({
  server: {
    handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) },
  },
});
