import { createFileRoute } from "@tanstack/react-router";
import { GroupOrderRoom } from "@/components/group-order-room";
import { isSharedPaymentRoomId } from "@/lib/mealdeck-shared-payments";
import { seo } from "@/lib/seo";
import sharedCss from "../styles.mealdeck-group-payments.css?url";
import roomCss from "../styles.mealdeck-group-room.css?url";

export const Route = createFileRoute("/group-order")({
  validateSearch: (search: Record<string, unknown>): { room?: string } =>
    isSharedPaymentRoomId(search["room"]) ? { room: search["room"] } : {},
  head: () => {
    const metadata = seo({
      title: "Your group order room — choose together, pay your way | MealDeck",
      description:
        "Create a private MealDeck room, invite your group and choose food together. Pay for your own items or let the organiser pay, with one kitchen order and bags named for each person.",
      path: "/group-order",
    });
    return {
      ...metadata,
      meta: [
        ...metadata.meta,
        { name: "robots", content: "noindex, nofollow" },
        { name: "referrer", content: "no-referrer" },
      ],
      links: [
        ...metadata.links,
        { rel: "stylesheet", href: sharedCss },
        { rel: "stylesheet", href: roomCss },
      ],
    };
  },
  component: GroupOrderPage,
});

function GroupOrderPage() {
  const { room } = Route.useSearch();
  return <GroupOrderRoom {...(room ? { routeRoomId: room } : {})} />;
}
