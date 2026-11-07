import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppCheckout } from "@/components/whatsapp-checkout";
import { prepareWhatsAppCheckoutIntake } from "@/lib/mealdeck-whatsapp-checkout-browser";
import { seo } from "@/lib/seo";
import checkoutCss from "../styles.launch-checkout.css?url";
import whatsAppCss from "../styles.whatsapp-checkout.css?url";

export const Route = createFileRoute("/whatsapp/checkout")({
  beforeLoad: () => {
    prepareWhatsAppCheckoutIntake();
  },
  headers: () => ({
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  }),
  head: () => {
    const metadata = seo({
      title: "Your WhatsApp checkout | MealDeck",
      description:
        "Review your confirmed MealDeck WhatsApp choices and continue to secure collection checkout.",
      path: "/whatsapp/checkout",
      noIndex: true,
    });
    return {
      ...metadata,
      meta: [...metadata.meta, { name: "referrer", content: "no-referrer" }],
      links: [
        ...metadata.links,
        { rel: "stylesheet", href: checkoutCss },
        { rel: "stylesheet", href: whatsAppCss },
      ],
    };
  },
  component: WhatsAppCheckout,
});
