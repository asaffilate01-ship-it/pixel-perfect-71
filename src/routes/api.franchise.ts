import { createFileRoute } from "@tanstack/react-router";
import { handleFranchiseRequest } from "@/lib/franchise-api";

function handle(request: Request) {
  return handleFranchiseRequest(request, {
    apiUrl: process.env["OMNIQORA_PUBLIC_API_URL"],
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
