import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, seo, stAlbansBusiness } from "@/lib/seo";

export const Route = createFileRoute("/st-albans")({
  head: () => ({
    ...seo({
      title: "Food Delivery St Albans — Breakfast & Lunch Delivered | MealDeck",
      description: "Weekday breakfast and lunch in St Albans, Mon–Fri 09:00–16:00. Café1 classics, French tacos, burgers, desi, fresh juices and iced coffee in one order — MealDeck online delivery is currently available; other fulfilment modes are being enabled separately.",
      path: "/st-albans",
      keywords: "food delivery St Albans, lunch delivery St Albans, breakfast delivery St Albans, office lunch St Albans, takeaway St Albans, café St Albans delivery, dine in St Albans",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...stAlbansBusiness })],
  }),
  component: () => (
    <LocationPage
      town="St Albans"
      intro="MealDeck St Albans is your weekday breakfast and lunch hand — Café1's café classics, exclusive to St Albans, alongside every MealDeck brand, in one order. Order through MealDeck online for delivery; other collection and on-site modes will appear when enabled."
      hours="Mon–Fri · 09:00–16:00"
      fulfilment="Delivery · MealDeck online"
      areas={["Selected areas in and around St Albans", "St Albans city centre", "Fleetville", "Marshalswick", "Verulam", "Clarence Park", "and nearby neighbourhoods"]}
      includeCafe1
      faqs={[
        { q: "When does MealDeck deliver in St Albans?", a: "Monday to Friday, 09:00–16:00, to selected areas in and around St Albans." },
        { q: "Can I dine in?", a: "MealDeck online checkout is currently configured for delivery in St Albans. Ask Café 1 directly about on-site service." },
        { q: "Do you offer kerbside or pickup in St Albans?", a: "These are planned for MealDeck's St Albans ordering channel and will appear at checkout when enabled." },
        { q: "Can I order lunch for my office?", a: "Yes — use group ordering so everyone adds their picks, then split payments at checkout." },
      ]}
    />
  ),
});
