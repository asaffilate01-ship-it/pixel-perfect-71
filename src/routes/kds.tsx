import { createFileRoute } from "@tanstack/react-router";
import { MealDeckOperations } from "@/components/ops/operations-workspace";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/kds")({
  head: () => {
    const tags = seo({
      title: "Kitchen display | MealDeck",
      description: "Secure MealDeck kitchen stations and central pass. Staff sign-in required.",
      path: "/kds",
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
  component: KitchenWorkspace,
});
function KitchenWorkspace() {
  return <MealDeckOperations kitchenMode />;
}
