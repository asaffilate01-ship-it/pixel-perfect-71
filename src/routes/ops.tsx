import { createFileRoute } from "@tanstack/react-router";
import { MealDeckOperations } from "@/components/ops/operations-workspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/ops")({
  head: () => {
    const tags = seo({
      title: "Staff operations | MealDeck",
      description: "Secure internal MealDeck staff operations. Sign-in required.",
      path: "/ops",
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
  component: MealDeckOperations,
});
