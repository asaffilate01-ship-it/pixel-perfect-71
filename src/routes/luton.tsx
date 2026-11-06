import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";
import { MEALDECK_LAUNCH_HOURS_LABEL } from "@/lib/mealdeck-launch-schedule";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "Food and burgers in Luton — Five launch menus | MealDeck",
      description:
        "Explore Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries, mac and cheese and Moktl mocktails. Luton opening: 6–8 November 2026.",
      path: "/luton",
      keywords:
        "MealDeck Luton, food in Luton, burgers in Luton, Skorch burgers Luton, Tavo chicken Luton, Moktl mocktail lounge Luton, Souvano Greek and Turkish food, Load’d loaded fries, mac and cheese",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      intro="Food in Luton for every craving: Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails. Opening 6–8 November 2026, with one basket for collection or kerbside. Guests can order without registering during our first three days’ opening hours, with no loyalty points on guest orders."
      hours={MEALDECK_LAUNCH_HOURS_LABEL}
      fulfilment="Collection · Kerbside · Delivery unavailable"
      areas={[
        "Collection and kerbside from 314–318 Selbourne Road, Luton, LU4 8NU",
        "Delivery is not available for this launch",
      ]}
      includeCafe1={false}
      faqs={[
        {
          q: "When is MealDeck opening in Luton?",
          a: "Our opening weekend is 6–8 November 2026: Friday 6 November, 3pm–11pm; Saturday 7 November and Sunday 8 November, 1pm–11pm. All times are UK local time. Online ordering remains coming soon while the service is prepared for launch.",
        },
        {
          q: "Which brands are in the first launch?",
          a: "Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Mix the five launch brands in one basket when ordering opens. The other brands are planned for later decks.",
        },
        {
          q: "Where can I find burgers in Luton?",
          a: "Explore Skorch burgers in Luton for smash burgers, or browse Tavo chicken for chicken burgers, wings and tenders. Both are part of MealDeck’s first five menus, with the exact choices and current prices shown on the menu page.",
        },
        {
          q: "What is on the Moktl mocktail lounge menu in Luton?",
          a: "Moktl brings zero-alcohol mocktails to the same MealDeck basket as your food. Browse its named drinks and prices on the menu page. Launch fulfilment is collection or kerbside from the Luton kitchen.",
        },
        {
          q: "Can I collect my order or use kerbside pickup?",
          a: "Yes. Collection and kerbside pickup are the two launch options. Delivery is unavailable. For kerbside, enter the car make, colour and last four registration characters. St Albans and Bedford remain coming soon.",
        },
        {
          q: "Do I need to register?",
          a: "You can order as a guest during the opening hours on 6–8 November. Guests and members can use the 30% offer and Sunday's 99p milk cake offer. Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive for double loyalty points. Guest orders earn no loyalty points. Verify your email for your member account; marketing emails and promotional app alerts remain separate, optional choices.",
        },
        {
          q: "Can we order as a group?",
          a: "Yes. The organiser creates a private room and invites each person to join within 3 minutes. Everyone chooses their own food and marks themselves ready. Unaccepted invitations expire; people who join keep their place. The organiser reviews and locks the choices, then each person pays for their own items or the organiser pays for everyone. Once all required payments are confirmed, one order goes to the kitchen with each person’s name beside their food and an itemised bill per person.",
        },
      ]}
    />
  ),
});
