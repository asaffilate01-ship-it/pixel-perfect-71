import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/bedford")({
  head: () => ({
    ...seo({
      title: "MealDeck Bedford — Coming Soon",
      description:
        "MealDeck Bedford is in the shuffle. The same collection of restaurants, one basket and one delivery fee — launch details confirmed soon.",
      path: "/bedford",
      keywords: "MealDeck Bedford, food delivery Bedford, takeaway Bedford, Bedford restaurants",
    }),
  }),
  component: () => (
    <LocationPage
      town="Bedford"
      intro="MealDeck Bedford is coming soon — a planned collection of restaurants, mixed in one basket with one delivery fee and one checkout. We'll confirm launch details here."
      hours="Launch to be confirmed"
      fulfilment="Ordering coming soon"
      areas={["Bedford", "Adjacent areas confirmed at launch"]}
      includeCafe1={false}
      faqs={[
        { q: "Is MealDeck open in Bedford yet?", a: "Not yet — Bedford is in the shuffle and we'll confirm the launch on this page." },
        { q: "Which brands will Bedford get?", a: "The MealDeck brand collection shown on the homepage, subject to final confirmation." },
        { q: "How will ordering work in Bedford?", a: "The plan is one basket across brands, one delivery fee and one checkout. Available brands and delivery areas will be confirmed before launch." },
        { q: "Where can I follow progress?", a: "Launch updates appear on this page and in the MealDeck expansion list on the homepage." },
      ]}
    />
  ),
});
