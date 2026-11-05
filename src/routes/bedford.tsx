import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/bedford")({
  head: () => ({
    ...seo({
      title: "MealDeck Bedford — Coming Soon",
      description:
        "MealDeck Bedford is coming in a future deck. Luton is the first launch kitchen; Bedford dates, brands and service areas will be confirmed separately.",
      path: "/bedford",
      keywords: "MealDeck Bedford, food delivery Bedford, takeaway Bedford, Bedford restaurants",
    }),
  }),
  component: () => (
    <LocationPage
      town="Bedford"
      intro="Bedford is coming in a future deck. Luton is the first MealDeck launch kitchen. We'll confirm Bedford's opening date, brand line-up and service areas here before orders become available."
      hours="Launch to be confirmed"
      fulfilment="Ordering coming soon"
      areas={["Bedford", "Adjacent areas confirmed at launch"]}
      includeCafe1={false}
      faqs={[
        { q: "Is MealDeck open in Bedford yet?", a: "Not yet. Only Luton is in the first launch; Bedford is coming in a later deck and its opening date will be confirmed on this page." },
        { q: "Which brands will Bedford get?", a: "Bedford's brand line-up will be confirmed before its own launch. The menus available to browse now belong to the first Luton deck." },
        { q: "How will ordering work in Bedford?", a: "The plan is one basket across brands, one delivery fee and one checkout. Available brands and delivery areas will be confirmed before launch." },
        { q: "Where can I follow progress?", a: "Launch updates appear on this page and in the MealDeck expansion list on the homepage." },
      ]}
    />
  ),
});
