import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, seo, stAlbansBusiness } from "@/lib/seo";

export const Route = createFileRoute("/st-albans")({
  head: () => ({
    ...seo({
      title: "MealDeck St Albans — Food Delivery Coming Soon",
      description: "MealDeck delivery in St Albans is coming soon, with planned weekday hours Mon–Fri 09:00–16:00. Browse the brand collection and launch menus. Café1's direct services are separate.",
      path: "/st-albans",
      keywords: "food delivery St Albans, lunch delivery St Albans, breakfast delivery St Albans, office lunch St Albans, takeaway St Albans, café St Albans delivery, dine in St Albans",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...stAlbansBusiness })],
  }),
  component: () => (
    <LocationPage
      town="St Albans"
      intro="MealDeck St Albans is planning a weekday breakfast and lunch delivery service. Browse the brand collection and launch menus while we prepare. Café1's direct counter and dine-in services remain separate."
      hours="Mon–Fri · 09:00–16:00"
      fulfilment="Delivery only · Ordering coming soon"
      areas={["Selected areas in and around St Albans", "St Albans city centre", "Fleetville", "Marshalswick", "Verulam", "Clarence Park", "and nearby neighbourhoods"]}
      includeCafe1
      faqs={[
        { q: "When does MealDeck deliver in St Albans?", a: "Ordering is not open yet. Planned hours are Monday to Friday, 09:00–16:00, with delivery areas confirmed before launch." },
        { q: "Can I dine in through MealDeck?", a: "The MealDeck St Albans channel is planned for delivery only. Café1's own dine-in and counter services are separate from MealDeck." },
        { q: "Do you offer kerbside or pickup in St Albans?", a: "MealDeck St Albans is delivery only. Contact Café1 directly about its separate services." },
        { q: "Can I order lunch for my office?", a: "Group ordering and split payments are planned. Ordering is coming soon; the menus are available to browse now." },
      ]}
    />
  ),
});
