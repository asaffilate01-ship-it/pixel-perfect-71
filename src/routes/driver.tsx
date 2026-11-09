import { createFileRoute } from "@tanstack/react-router";
import { DriverWorkspace } from "@/components/driver/driver-workspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/driver")({
  head: () => {
    const tags = seo({
      title: "Driver workspace | MealDeck",
      description: "Private driver shift, assignments and handovers for MealDeck Luton.",
      path: "/driver",
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
  component: DriverWorkspace,
});
