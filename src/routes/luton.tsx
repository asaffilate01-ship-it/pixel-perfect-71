import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { ldScript, lutonBusiness, seo } from "@/lib/seo";
import {
  MEALDECK_LUTON_HOURS_LABEL,
  MEALDECK_LUTON_HOURS_PROSE,
} from "@/lib/mealdeck-launch-schedule";

export const Route = createFileRoute("/luton")({
  head: () => ({
    ...seo({
      title: "MealDeck Luton | Free Local Delivery, Pickup & Uber Eats",
      description:
        "Find MealDeck at 314–318 Selbourne Road, LU4 8NU. Free direct delivery within 4 km on £15+ after discounts when available, plus collection, kerbside and Uber Eats.",
      path: "/luton",
    }),
    scripts: [ldScript({ "@context": "https://schema.org", ...lutonBusiness })],
  }),
  component: LutonPage,
});

function LutonPage() {
  return (
    <LocationPage
      town="Luton"
      intro="Our five Luton menus bring Skorch smash burgers, Tavo chicken wings and tenders, Souvano doner and lamb chops, Load’d loaded fries and mac and cheese, and Moktl mocktails into one takeaway order. Choose eligible free local delivery, collect from Selbourne Road or use kerbside pickup."
      hours={MEALDECK_LUTON_HOURS_LABEL}
      fulfilment="Collection · Kerbside · Free delivery"
      areas={[
        "Collection and kerbside from 314–318 Selbourne Road, Luton, LU4 8NU",
        "Free direct delivery within 4 km of LU4 8NU on £15+ after discounts, subject to checkout availability",
      ]}
      includeCafe1={false}
      faqs={[
        {
          q: "Is Meal Deck the same as MealDeck?",
          a: "Yes. Our name is written MealDeck, and this is the official MealDeck Luton website. Our collection kitchen is at 314–318 Selbourne Road, Luton, LU4 8NU. Browse the five menus and place one order for eligible local delivery, collection or kerbside during kitchen opening hours.",
        },
        {
          q: "What are MealDeck Luton's opening hours?",
          a: `${MEALDECK_LUTON_HOURS_PROSE} Order online for Luton collection, kerbside or eligible free direct delivery during kitchen opening hours.`,
        },
        {
          q: "Which brands are in the first launch?",
          a: "Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Mix the five launch brands in one basket for eligible delivery, collection or kerbside. The other brands are planned for later decks.",
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
          a: "Moktl brings zero-alcohol mocktails to the same MealDeck basket as your food. Browse its named drinks and prices on the menu page. Choose eligible direct delivery, collection or kerbside from the Luton kitchen.",
        },
        {
          q: "Can I collect my order or use kerbside pickup?",
          a: "Yes. Collection and kerbside pickup are available when the kitchen is open. For kerbside, enter your car make, colour and last four registration characters. Free direct delivery is offered within 4 km on £15+ after discounts if the checkout confirms an available driver. Live GPS tracking is not yet available. St Albans and Bedford remain coming soon.",
        },
        {
          q: "Do I need to register?",
          a: "No. You can order as a guest during kitchen opening hours with your name and WhatsApp number. Guests earn no loyalty points. Members can register for member-only offers; marketing messages and alerts remain separate, optional choices.",
        },
        {
          q: "Can we order as a group?",
          a: "Group rooms are offered only when the live group-order checkout check confirms availability. The organiser can invite people to join within 3 minutes, and each person selects their dishes. When everyone is ready, the organiser reviews the choices. Each person can pay their own share or the organiser can pay the whole amount. The kitchen gets one group order only after all required payments are verified.",
        },
      ]}
    />
  );
}
