import { createFileRoute } from "@tanstack/react-router";
import { LaunchCheckout } from "@/components/launch-checkout";
import { seo } from "@/lib/seo";
import checkoutCss from "../styles.launch-checkout.css?url";

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>): { order?: string; cancelled?: boolean } => ({
    ...(typeof search["order"] === "string" && /^[a-f0-9-]{36}$/i.test(search["order"])
      ? { order: search["order"] }
      : {}),
    ...(search["cancelled"] === "1" || search["cancelled"] === 1 || search["cancelled"] === true
      ? { cancelled: true }
      : {}),
  }),
  head: () => {
    const metadata = seo({
      title: "Secure collection checkout | MealDeck",
      description:
        "Register, choose collection or kerbside pickup and securely pay for your MealDeck order in Luton.",
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
  const { order, cancelled } = Route.useSearch();
  return (
    <LaunchCheckout {...(order ? { orderId: order } : {})} {...(cancelled ? { cancelled } : {})} />
  );
}
