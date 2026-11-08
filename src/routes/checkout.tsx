import { createFileRoute } from "@tanstack/react-router";
import { LaunchCheckout } from "@/components/launch-checkout";
import { seo } from "@/lib/seo";
import { notificationReceiptMode } from "@/lib/mealdeck-order-notifications-browser";
import checkoutCss from "../styles.launch-checkout.css?url";

export const Route = createFileRoute("/checkout")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    order?: string;
    cancelled?: boolean;
    group?: boolean;
    notificationMode?: "guest" | "member";
  } => {
    const order =
      typeof search["order"] === "string" && /^[a-f0-9-]{36}$/i.test(search["order"])
        ? search["order"]
        : undefined;
    const notificationMode = notificationReceiptMode(order, search["notificationMode"]);
    return {
      ...(order ? { order } : {}),
      ...(notificationMode ? { notificationMode } : {}),
      ...(search["cancelled"] === "1" || search["cancelled"] === 1 || search["cancelled"] === true
        ? { cancelled: true }
        : {}),
      ...(search["group"] === "1" || search["group"] === 1 || search["group"] === true
        ? { group: true }
        : {}),
    };
  },
  head: () => {
    const metadata = seo({
      title: "Secure delivery, collection or kerbside checkout | MealDeck",
      description:
        "Review your MealDeck basket, check own-driver free delivery within 3 km of LU4 8NU on orders over £15 after discounts, or choose collection and kerbside. Guest checkout needs no account.",
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
  const { order, cancelled, group, notificationMode } = Route.useSearch();
  return (
    <LaunchCheckout
      {...(order ? { orderId: order } : {})}
      {...(notificationMode ? { notificationMode } : {})}
      {...(cancelled ? { cancelled } : {})}
      groupExpected={group === true}
    />
  );
}
