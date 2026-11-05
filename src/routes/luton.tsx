import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";
import { MEALDECK_LAUNCH_HOURS_LABEL } from "@/lib/mealdeck-launch-schedule";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "MealDeck Luton — Five Brands, One Launch Kitchen",
      description: "MealDeck Luton opens 6–8 November 2026: Friday 3pm–11pm, Saturday and Sunday 1pm–11pm. Five brands, collection or kerbside, and 30% off with no minimum. Guests welcome; delivery is unavailable.",
      path: "/luton",
      keywords: "MealDeck Luton, food delivery Luton, smash burgers Luton, chicken Luton, Mediterranean grill Luton, loaded fries Luton, mocktails Luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      intro="Luton opens 6–8 November 2026 with Skorch smash burgers, Tavo Chicken, Souvano Mediterranean grill, Load’d loaded fries and mac ’n’ cheese, and Moktl mocktails. Five brands, one basket, collection or kerbside. Guests can order without registering during our first three days’ opening hours, with no loyalty points on guest orders."
      hours={MEALDECK_LAUNCH_HOURS_LABEL}
      fulfilment="Collection · Kerbside · Delivery unavailable"
      areas={["Collection and kerbside from 314–318 Selbourne Road, Luton, LU4 8NU", "Delivery is not available for this launch"]}
      includeCafe1={false}
      faqs={[
        { q: "When is MealDeck opening in Luton?", a: "Our opening weekend is 6–8 November 2026: Friday 6 November, 3pm–11pm; Saturday 7 November and Sunday 8 November, 1pm–11pm. All times are UK local time. Online ordering remains coming soon while the service is prepared for launch." },
        { q: "Which brands are in the first launch?", a: "Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Mix the five launch brands in one basket when ordering opens. The other brands are planned for later decks." },
        { q: "Can I collect my order or use kerbside pickup?", a: "Yes. Collection and kerbside pickup are the two launch options. Delivery is unavailable. For kerbside, enter the car make, colour and last four registration characters. St Albans and Bedford remain coming soon." },
        { q: "Do I need to register?", a: "You can order as a guest during the opening hours on 6–8 November. Guests and members can use the 30% offer and Sunday's 99p milk cake offer. Register and spend £15 or more by and including Friday 13 November 2026 for double loyalty points. Guest orders earn no loyalty points. Verify your email for your member account; marketing emails and promotional app alerts remain separate, optional choices." },
        { q: "Can my group split the bill?", a: "Group ordering and split payments are planned. They will become available once the payment and ordering service is ready; no payments are being accepted yet." },
      ]}
    />
  ),
});
