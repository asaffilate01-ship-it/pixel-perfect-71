import { createFileRoute } from "@tanstack/react-router";
import { LocationPage } from "@/components/location-page";
import { useOwnDriverAvailability, useOwnDriverPreopenNotice } from "@/components/own-driver-offer-banner";
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
  component: LutonPage,
});

function LutonPage() {
  const deliveryLive = useOwnDriverAvailability();
  const deliveryPreopen = useOwnDriverPreopenNotice();
  return (
    <LocationPage
      town="Luton"
      intro="Our five Luton menus bring Skorch smash burgers, Tavo chicken wings and tenders, Souvano doner and lamb chops, Load’d loaded fries and mac and cheese, and Moktl mocktails into one takeaway order. Collect from Selbourne Road or choose kerbside pickup."
      hours={MEALDECK_LAUNCH_HOURS_LABEL}
      fulfilment={deliveryLive ? "Collection · Kerbside · Free delivery" : "Collection · Kerbside"}
      areas={[
        "Collection and kerbside from 314–318 Selbourne Road, Luton, LU4 8NU",
        deliveryLive
          ? "Free delivery within 3 km of LU4 8NU on orders £15+ after discounts"
          : deliveryPreopen
            ? "Free delivery planned from 3pm today within 3 km of LU4 8NU; £15 after discounts, subject to readiness"
            : "Delivery currently unavailable",
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
          a: deliveryLive
            ? "Yes. You can collect, use kerbside pickup, or select free local delivery if your postcode is within 3 km of LU4 8NU and you pay at least £15 after discounts. Our driver delivers within an estimated 60 minutes. No registration or live GPS tracking. St Albans and Bedford remain coming soon."
            : "Yes. Collection and kerbside pickup are available. For kerbside, enter your car make, colour and last four registration characters. St Albans and Bedford remain coming soon.",
        },
        {
          q: "Do I need to register?",
          a: "No. You can order as a guest during kitchen opening hours with your name and WhatsApp number. Guests earn no loyalty points. Members can register for member-only offers; marketing messages and alerts remain separate, optional choices.",
        },
        {
          q: "Can we order as a group?",
          a: "Group ordering starts on Monday 9 November. The organiser creates a private room and invites each person to join within 3 minutes. Everyone chooses their own food and marks themselves ready. Unaccepted invitations expire; people who join keep their place. The organiser reviews and locks the choices, then each person pays for their own items or the organiser pays for everyone. Once all required payments are confirmed, one order goes to the kitchen with each person’s name beside their food and an itemised bill per person.",
        },
      ]}
    />
  );
}
