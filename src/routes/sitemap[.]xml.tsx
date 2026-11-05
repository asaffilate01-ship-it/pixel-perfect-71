import { createFileRoute } from "@tanstack/react-router";
import { mealDeckSitemap } from "@/lib/mealdeck-sitemap";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(mealDeckSitemap(), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        }),
    },
  },
});
