import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, seo, stAlbansBusiness } from "@/lib/seo";

export const Route = createFileRoute("/st-albans")({
  head: () => ({
    ...seo({
      title: "Food Delivery St Albans — Breakfast & Lunch Delivered | MealDeck",
      description: "Weekday breakfast and lunch in St Albans, Mon–Fri 09:00–16:00. Café1 classics, French tacos, burgers, desi, fresh juices and iced coffee in one order — delivery, kerbside, pickup or dine in at Café 1.",
      path: "/st-albans",
      keywords: "food delivery St Albans, lunch delivery St Albans, breakfast delivery St Albans, office lunch St Albans, takeaway St Albans, café St Albans delivery, dine in St Albans",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...stAlbansBusiness })],
  }),
  component: () => (
    <LocationPage
      town="St Albans"
      intro="MealDeck St Albans is your weekday breakfast and lunch hand — Café1's café classics, exclusive to St Albans, alongside every MealDeck brand, in one order. Delivery, kerbside, pickup, or dine in at Café 1."
      hours="Mon–Fri · 09:00–16:00"
      fulfilment="Delivery · Kerbside · Pickup · Dine in"
      areas={["Selected areas in and around St Albans", "St Albans city centre", "Fleetville", "Marshalswick", "Verulam", "Clarence Park", "and nearby neighbourhoods"]}
      includeCafe1
      faqs={[
        { q: "When does MealDeck deliver in St Albans?", a: "Monday to Friday, 09:00–16:00, to selected areas in and around St Albans." },
        { q: "Can I dine in?", a: "Yes — dine in at Café 1, St Albans, 6 Bricket Road, AL1 3JU. Choose Dine in when you order." },
        { q: "Do you offer kerbside or pickup in St Albans?", a: "Yes. St Albans supports delivery, kerbside collection, pickup and dine in." },
        { q: "Can I order lunch for my office?", a: "Yes — use group ordering so everyone adds their picks, then split payments at checkout." },
      ]}
    />
  ),
});
