import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, seo, stAlbansPageJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/st-albans")({
  head: () => ({
    ...seo({
      title: "MealDeck St Albans — Food Delivery Coming Soon",
      description:
        "MealDeck St Albans is coming in a future deck. Luton launches first with five brands; St Albans dates and menus will be confirmed separately. Café1's direct services are separate.",
      path: "/st-albans",
      keywords: "MealDeck St Albans coming soon, MealDeck future locations",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...stAlbansPageJsonLd })],
  }),
  component: () => (
    <LocationPage
      town="St Albans"
      intro="St Albans is coming in a future deck. MealDeck is launching in Luton first; the St Albans opening date, menus and delivery areas will be confirmed separately. Café1's direct counter and dine-in services remain separate."
      hours="To be confirmed before launch"
      fulfilment="Delivery only · Ordering coming soon"
      areas={[
        "Selected areas in and around St Albans",
        "St Albans city centre",
        "Fleetville",
        "Marshalswick",
        "Verulam",
        "Clarence Park",
        "and nearby neighbourhoods",
      ]}
      includeCafe1
      faqs={[
        {
          q: "When does MealDeck launch in St Albans?",
          a: "St Albans is coming later. Only Luton is in the first launch; the St Albans date, hours and delivery areas will be confirmed separately.",
        },
        {
          q: "Can I dine in through MealDeck?",
          a: "The MealDeck St Albans channel is planned for delivery only. Café1's own dine-in and counter services are separate from MealDeck.",
        },
        {
          q: "Do you offer kerbside or pickup in St Albans?",
          a: "No MealDeck orders are available in St Albans yet. Its future channel is planned for delivery only; launch pickup and kerbside are for Luton. Contact Café1 directly about its separate services.",
        },
        {
          q: "Can I order lunch for my office?",
          a: "St Albans ordering is coming soon. You can browse the first Luton deck now, but this does not confirm St Albans menu or delivery availability.",
        },
      ]}
    />
  ),
});
