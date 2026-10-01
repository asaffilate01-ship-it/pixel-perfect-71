import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "Food Delivery Luton — French Tacos, Burgers, Desi & More | MealDeck",
      description: "Order takeaway in Luton from French tacos, smash burgers, chicken, desi, parathas, grill, juices and mocktails — one basket, one delivery fee. Delivery, pickup or kerbside.",
      path: "/luton",
      keywords: "food delivery Luton, takeaway Luton, French tacos Luton, smash burgers Luton, chicken Luton, desi food Luton, kebab Luton, halal food Luton, late night food Luton, mocktails Luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      postcode="LU"
      intro="MealDeck Luton brings every brand in the deck to your door: French tacos, smash burgers, all things chicken, desi boxes, parathas, grill, vegetarian Indian, fresh juices, iced coffee and zero-alcohol mocktails — mixed in one order."
      hours="Opening hours set by the Luton kitchen"
      fulfilment="Delivery · Pickup · Kerbside"
      areas={["Luton town centre", "Bury Park", "High Town", "Stopsley", "Leagrave", "Marsh Farm", "Wigmore", "Farley Hill", "Dunstable Road", "Luton Airport area"]}
      includeCafe1={false}
      faqs={[
        { q: "Can I order from more than one brand in Luton?", a: "Yes — mix any brands in one basket and pay one delivery fee." },
        { q: "Do you offer pickup or kerbside in Luton?", a: "Yes. Luton supports delivery, pickup and kerbside collection." },
        { q: "Can my group split the bill?", a: "Yes. Group ordering and split payments are built in." },
      ]}
    />
  ),
});
