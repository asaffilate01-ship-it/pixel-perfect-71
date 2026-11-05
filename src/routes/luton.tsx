import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "MealDeck Luton — Five Brands, One Launch Kitchen",
      description: "Luton launches first with Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Browse the five menus. Delivery, pickup and kerbside ordering are coming soon.",
      path: "/luton",
      keywords: "MealDeck Luton, food delivery Luton, smash burgers Luton, chicken Luton, Mediterranean grill Luton, loaded fries Luton, mocktails Luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      intro="Our first launch is Luton: Skorch smash burgers, Tavo Chicken, Souvano Mediterranean grill, Load’d loaded fries and mac ’n’ cheese, and Moktl mocktails — five brands from one kitchen. Browse the menus while we prepare to open ordering. More brands, St Albans and Bedford are coming in future decks."
      hours="5pm–11pm · Monday to Sunday"
      fulfilment="Delivery · Pickup · Kerbside · Ordering soon"
      areas={["Luton town centre", "Bury Park", "High Town", "Stopsley", "Leagrave", "Marsh Farm", "Wigmore", "Farley Hill", "Delivery coverage to be confirmed before launch"]}
      includeCafe1={false}
      faqs={[
        { q: "When is MealDeck opening in Luton?", a: "Luton is our first launch kitchen. Planned hours are 5pm to 11pm, Monday to Sunday. Ordering is not open yet; the opening date will be confirmed here." },
        { q: "Which brands are in the first launch?", a: "Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Mix the five launch brands in one basket when ordering opens. The other brands are planned for later decks." },
        { q: "Will Luton offer walk-in pickup or kerbside collection?", a: "Yes, the Luton launch plan includes delivery, pickup and kerbside collection. Ordering and collection are not open yet. St Albans and Bedford remain coming soon." },
        { q: "Can my group split the bill?", a: "Group ordering and split payments are planned. They will become available once the payment and ordering service is ready; no payments are being accepted yet." },
      ]}
    />
  ),
});
