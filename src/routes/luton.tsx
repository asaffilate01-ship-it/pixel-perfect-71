import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "Food Delivery Luton — French Tacos, Burgers, Desi & More | MealDeck",
      description: "Order takeaway in Luton from French tacos, smash burgers, chicken, desi, parathas, juices and mocktails — one basket, one delivery fee. Open 5pm–11pm, Monday to Sunday.",
      path: "/luton",
      keywords: "food delivery Luton, takeaway Luton, French tacos Luton, smash burgers Luton, chicken Luton, desi food Luton, halal food Luton, late night food Luton, mocktails Luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      intro="MealDeck Luton brings every brand in the deck to your door: artisan pizza, French tacos, smash burgers, all things chicken, desi boxes, parathas, vegetarian Indian, fresh juices, iced coffee and zero-alcohol mocktails — mixed in one order."
      hours="5pm–11pm · Monday to Sunday"
      fulfilment="Delivery · Pickup · Kerbside"
      areas={["All areas across Luton", "Luton town centre", "Bury Park", "High Town", "Stopsley", "Leagrave", "Marsh Farm", "Wigmore", "Farley Hill", "and everywhere in between"]}
      includeCafe1={false}
      faqs={[
        { q: "When is MealDeck open in Luton?", a: "Every day, Monday to Sunday, 5pm to 11pm." },
        { q: "Can I order from more than one brand in Luton?", a: "Yes — mix any brands in one basket and pay one delivery fee." },
        { q: "Do you offer pickup or kerbside in Luton?", a: "Yes. Luton supports delivery, pickup and kerbside collection." },
        { q: "Can my group split the bill?", a: "Yes. Group ordering and split payments are built in." },
      ]}
    />
  ),
});
