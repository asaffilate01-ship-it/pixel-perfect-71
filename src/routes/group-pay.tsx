import { createFileRoute } from "@tanstack/react-router";
import { GroupPaymentRoom } from "@/components/group-payments/group-payment-room";
import { isSharedPaymentRoomId } from "@/lib/mealdeck-shared-payments";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/group-pay")({
  validateSearch: (search: Record<string, unknown>): { room?: string } =>
    isSharedPaymentRoomId(search["room"]) ? { room: search["room"] } : {},
  head: () => {
    const metadata = seo({
      title: "Your private group payment room | MealDeck",
      description:
        "Review your share, check confirmed group payment progress and complete an eligible MealDeck payment securely.",
      path: "/group-pay",
    });
    return {
      ...metadata,
      meta: [
        ...metadata.meta,
        { name: "robots", content: "noindex, nofollow" },
        { name: "referrer", content: "no-referrer" },
      ],
    };
  },
  component: GroupPaymentPage,
});

function GroupPaymentPage() {
  const { room } = Route.useSearch();
  return <GroupPaymentRoom {...(room ? { routeRoomId: room } : {})} />;
}
