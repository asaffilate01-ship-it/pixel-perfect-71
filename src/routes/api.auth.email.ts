import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { handleMealDeckAuthEmail } = await import("@/lib/mealdeck-auth-email.server");
  return handleMealDeckAuthEmail(request, process.env);
}

export const Route = createFileRoute("/api/auth/email")({
  server: {
    handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) },
  },
});
