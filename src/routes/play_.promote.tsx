import { createFileRoute } from "@tanstack/react-router";
import { ArcadePromotionKit } from "@/components/play/arcade-promotion-kit";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/play_/promote")({
  head: () =>
    seo({
      title: "MealDeck Play — Game Promotion Kit",
      description:
        "Make a game invitation, a vertical Story or a printable QR card. Free MealDeck games, ready to share with friends.",
      path: "/play/promote",
    }),
  component: ArcadePromotionKit,
});
