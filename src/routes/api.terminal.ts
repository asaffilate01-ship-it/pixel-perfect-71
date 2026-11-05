import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/terminal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleTerminalRequest } = await import("@/lib/mealdeck-terminal.server");
        return handleTerminalRequest(request, process.env);
      },
    },
  },
});
