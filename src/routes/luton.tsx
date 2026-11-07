import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";
import {
  MEALDECK_LAUNCH_HOURS_LABEL,
  MEALDECK_LAUNCH_HOURS_PROSE,
} from "@/lib/mealdeck-launch-schedule";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "MealDeck Luton | Takeaway Menus & Kerbside Collection",
      description:
        "Find MealDeck at 314–318 Selbourne Road, LU4 8NU. Browse smash burgers, wings, loaded fries, mocktails and milk cake for collection or kerbside.",
      path: "/luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: () => (
    <LocationPage
      town="Luton"
      intro="Our five Luton menus bring Skorch smash burgers, Tavo chicken wings and tenders, Souvano doner and lamb chops, Load’d loaded fries and mac and cheese, and Moktl mocktails into one takeaway order. Collect from Selbourne Road or choose kerbside pickup."
      hours={MEALDECK_LAUNCH_HOURS_LABEL}
      fulfilment="Collection · Kerbside · Delivery unavailable"
      areas={[
        "Collection and kerbside from 314–318 Selbourne Road, Luton, LU4 8NU",
        "Delivery is not available for this launch",
      ]}
      includeCafe1={false}
      faqs={[
        {
          q: "Is Meal Deck the same as MealDeck?",
          a: "Yes. Our name is written MealDeck, and this is the official MealDeck Luton website. Our collection kitchen is at 314–318 Selbourne Road, Luton, LU4 8NU. Browse the five menus and place one order for collection or kerbside during kitchen opening hours.",
        },
        {
          q: "When is MealDeck opening in Luton?",
          a: `Our opening weekend is 6–8 November 2026. ${MEALDECK_LAUNCH_HOURS_PROSE} Order online for Luton collection or kerbside during kitchen opening hours.`,
        },
        {
          q: "Which brands are in the first launch?",
          a: "Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Mix the five launch brands in one basket for collection or kerbside. The other brands are planned for later decks.",
        },
        {
          q: "Where can I find burgers in Luton?",
          a: "Explore Skorch burgers in Luton for smash burgers, or browse Tavo chicken for chicken burgers, wings and tenders. Both are part of MealDeck’s first five menus, with the exact choices and current prices shown on the menu page.",
        },
        {
          q: "Can I order loaded fries and mac and cheese in Luton?",
          a: "Load’d has loaded fries, loaded mac and cheese, and Full House boxes combining both. Choose from fried chicken, grilled chicken, chicken shawarma and smash beef toppings. Add dishes from the other MealDeck menus to the same basket for one collection.",
        },
        {
          q: "Does MealDeck have milk cake and desserts?",
          a: "Biscoff Milkcake and Oreo Milkcake are listed in the Desserts section of every launch menu. Browse the menu for current prices and availability, then add dessert to your food or mocktail order.",
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
          a: "Group ordering starts on Monday 9 November. The organiser creates a private room and invites each person to join within 3 minutes. Everyone chooses their own food and marks themselves ready. Unaccepted invitations expire; people who join keep their place. The organiser reviews and locks the choices, then each person pays for their own items or the organiser pays for everyone. Once all required payments are confirmed, one order goes to the kitchen with each person’s name beside their food and an itemised bill per person.",
        },
      ]}
    />
  ),
});
