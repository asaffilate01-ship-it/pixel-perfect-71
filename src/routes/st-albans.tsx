import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, seo, stAlbansBusiness } from "@/lib/seo";

export const Route = createFileRoute("/st-albans")({
  head: () => ({
    ...seo({
      title: "Food Delivery St Albans — Breakfast & Lunch Delivered | MealDeck",
      description: "Weekday breakfast and lunch delivery in St Albans, Mon–Fri 09:00–16:00. Café1 classics, French tacos, burgers, desi, fresh juices and iced coffee in one order.",
      path: "/st-albans",
      keywords: "food delivery St Albans, lunch delivery St Albans, breakfast delivery St Albans, office lunch St Albans, takeaway St Albans, café St Albans delivery",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...stAlbansBusiness })],
  }),
  component: () => (
    <LocationPage
      town="St Albans"
      postcode="AL"
      intro="MealDeck St Albans is your weekday breakfast and lunch hand — Café1's British café favourites, exclusive to St Albans, alongside every MealDeck brand, delivered in one order."
      hours="Mon–Fri · 09:00–16:00"
      fulfilment="Delivery only"
      areas={["St Albans city centre", "Fleetville", "Marshalswick", "Verulam", "Clarence Park", "London Colney", "How Wood", "Chiswell Green", "Park Street"]}
      includeCafe1
      faqs={[
        { q: "When does MealDeck deliver in St Albans?", a: "Monday to Friday, 09:00–16:00. Delivery only." },
        { q: "What is Café1?", a: "Café1 serves British café favourites and is only available to St Albans (AL) postcodes." },
        { q: "Can I order lunch for my office?", a: "Yes — use group ordering so everyone adds their picks, then split payments at checkout." },
      ]}
    />
  ),
});
