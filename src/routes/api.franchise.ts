import { createFileRoute } from "@tanstack/react-router";
import { handleFranchiseRequest } from "@/lib/franchise-api";

function handle(request: Request) {
  const apiUrl = process.env["OMNIQORA_PUBLIC_API_URL"];
  // Without the live service, the page shows its built-in territory list instead.
  if (request.method === "GET" && !apiUrl?.trim()) {
    return Response.json(
      { ok: false, live: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleFranchiseRequest(request, {
    apiUrl,
    allowInsecureLocalhost: process.env["NODE_ENV"] === "development",
  });
}

export const Route = createFileRoute("/api/franchise")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
