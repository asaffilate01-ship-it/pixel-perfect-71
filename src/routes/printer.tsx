import { createFileRoute } from "@tanstack/react-router";
import { PrinterWorkspace } from "@/components/ops/printer-workspace";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/printer")({
  head: () => {
    const tags = seo({
      title: "Receipt printer | MealDeck",
      description: "Private MealDeck receipt terminal. Authorised staff sign-in required.",
      path: "/printer",
    });
    return {
      ...tags,
      meta: [
        ...tags.meta,
        { name: "robots", content: "noindex, nofollow, noarchive" },
        { name: "referrer", content: "no-referrer" },
      ],
    };
  },
  component: PrinterWorkspace,
});
