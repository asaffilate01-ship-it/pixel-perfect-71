import { createFileRoute } from "@tanstack/react-router";
import { LaunchCheckout } from "@/components/launch-checkout";
import { seo } from "@/lib/seo";
import checkoutCss from "../styles.launch-checkout.css?url";

export const Route = createFileRoute("/checkout")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { order?: string; cancelled?: boolean; group?: boolean } => ({
    ...(typeof search["order"] === "string" && /^[a-f0-9-]{36}$/i.test(search["order"])
      ? { order: search["order"] }
      : {}),
    ...(search["cancelled"] === "1" || search["cancelled"] === 1 || search["cancelled"] === true
      ? { cancelled: true }
      : {}),
    ...(search["group"] === "1" || search["group"] === 1 || search["group"] === true
      ? { group: true }
      : {}),
  }),
  head: () => {
    const metadata = seo({
      title: "Secure collection checkout | MealDeck",
      description:
        "Review your MealDeck basket, choose collection or kerbside pickup and check the current ordering status. Guest checkout is available during the confirmed opening-weekend hours when ordering is open.",
      path: "/checkout",
    });
    return {
      ...metadata,
      meta: [...metadata.meta, { name: "robots", content: "noindex, nofollow" }],
      links: [...metadata.links, { rel: "stylesheet", href: checkoutCss }],
    };
  },
  component: CheckoutPage,
});

function CheckoutPage() {
  const { order, cancelled, group } = Route.useSearch();
  return (
    <LaunchCheckout
      {...(order ? { orderId: order } : {})}
      {...(cancelled ? { cancelled } : {})}
      groupExpected={group === true}
    />
  );
}
