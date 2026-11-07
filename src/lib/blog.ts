import { MEALDECK_OFFERS } from "./mealdeck-offers";
import { MEALDECK_LAUNCH_HOURS_PROSE } from "./mealdeck-launch-schedule";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  date: string;
  rank: string;
  suit: "♥" | "♦" | "♠" | "♣";
  tag: string;
  keywords: string;
  body: { h?: string; p: string }[];
};

export const posts: Post[] = [
  {
    slug: "cash-in-your-chips-loyalty-points",
    title: "Double Loyalty Points: Your November MealDeck Offer",
    excerpt:
      "Register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive for double loyalty points. Marketing choices stay optional.",
    image: "/blog/loyalty-points.jpg",
    date: "2026-11-05",
    rank: "10",
    suit: "♦",
    tag: "Loyalty",
    keywords: "MealDeck double loyalty points, Luton offers November 2026, MealDeck member offers",
    body: [
      {
        p: "The November member offer is double loyalty points when you register and spend £15 or more from Monday 9 to Friday 13 November 2026 inclusive.",
      },
      {
        h: "Use your member account",
        p: "Register with MealDeck, verify your email and use your account. Guest orders do not earn loyalty points.",
      },
      {
        h: "Your marketing choices are separate",
        p: "You do not need to sign up for promotional emails or app alerts to qualify. Each channel is an optional choice in your account.",
      },
      {
        h: "Your points balance",
        p: "Your account will show points when the loyalty service is available. The earning and redemption details will be published before points are credited; a promotional announcement is not a points balance.",
      },
      {
        h: "Games are just for fun",
        p: "MealDeck Play is free and separate from purchase offers. Playing or winning a game does not earn loyalty points, food, cash or discounts.",
      },
    ],
  },
  {
    slug: "house-rules-every-offer-explained",
    title: "House Rules: Every MealDeck Offer, Explained",
    excerpt:
      "30% off the entire menu, Sunday milk cake for 99p, and double loyalty points. The three November offers, with their dates and details.",
    image: "/blog/offers-explained.jpg",
    date: "2026-11-05",
    rank: "9",
    suit: "♥",
    tag: "Offers",
    keywords:
      "MealDeck offers Luton, 30 percent off November 2026, 99p milk cake, double loyalty points",
    body: [
      {
        p: "These are the three MealDeck offers for November 2026. Luton launches first, with collection and kerbside pickup.",
      },
      ...MEALDECK_OFFERS.map((offer) => ({
        h: `${offer.value} · ${offer.title}`,
        p: offer.terms.join(" "),
      })),
      {
        h: "Opening hours",
        p: `${MEALDECK_LAUNCH_HOURS_PROSE} Check the Offers page for the full details and checkout for current ordering availability.`,
      },
    ],
  },
  {
    slug: "deal-everyone-in-group-food-order-luton",
    title: "Deal Everyone In: How to Nail a Group Food Order in Luton",
    excerpt:
      "Everyone chooses from five launch menus, sends their picks back and gets a numbered bag. The organiser reviews one order and the payment options available at checkout.",
    image: "/blog/group-order.jpg",
    date: "2026-09-28",
    rank: "A",
    suit: "♥",
    tag: "Group ordering",
    keywords: "group food order Luton, collection Luton, group takeaway, MealDeck invitations",
    body: [
      {
        p: "Different cravings can share one collection. MealDeck’s group planner brings Skorch, Tavo Chicken, Souvano, Load’d and Moktl into one organiser-reviewed order for Luton collection or kerbside pickup. Delivery is unavailable.",
      },
      {
        h: "Invite, choose, send back",
        p: "Start a group on the Group order page and create a separate invitation link for each person. They choose their exact food, flavours, portions and extras, then send a reply link back to you. Open or paste that reply in the browser where you started the group and review it before adding the choices.",
      },
      {
        h: "Review food, then payment",
        p: "The organiser checks everyone’s food, numbered bags and final total. When ordering is available, checkout shows which payment options are ready: an organiser payment, or enabled shared payments by bag or equal split. Shared payments use a separate private room after review; the kitchen starts only after all required payments are confirmed. The food planner remains a local draft: changed choices need a new reply link, and reviewed replies replace that person’s previous choices.",
      },
      {
        h: "Check the current offers",
        p: "The November offers are 30% off the entire menu on 6–8 November, milk cake for 99p with every order on Sunday 8 November, and double loyalty points when you register and spend £15 or more from Monday 9 to Friday 13 November inclusive. See the Offers page for details. Guest orders earn no points.",
      },
      {
        h: "Keep each person’s food together",
        p: "Review one numbered bag per person before checkout. Names remain in your local draft; the kitchen receives the numbered packing plan. Your personal menu basket stays saved separately. Invitation links let anyone who has them prepare a reply, and reply links reveal food choices, so share them privately and check who sent each reply.",
      },
    ],
  },
  {
    slug: "french-tacos-luton-ace-of-the-deck",
    title: "French Tacos in Luton: A Future MealDeck Menu",
    excerpt:
      "Taconelle’s French tacos are planned for a future deck. Explore the five confirmed Luton launch menus, including Load’d loaded fries and mac and cheese.",
    image: "/blog/french-taco-luton.jpg",
    date: "2026-09-21",
    rank: "K",
    suit: "♦",
    tag: "Food guide",
    keywords:
      "French tacos Luton coming soon, Load’d loaded fries, mac and cheese Luton, MealDeck future menus",
    body: [
      {
        p: "French tacos are part of MealDeck’s wider brand collection through Taconelle. That menu is planned for a future deck; its launch date and choices will be confirmed separately.",
      },
      {
        h: "Explore the five Luton launch menus",
        p: "Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails form the first deck. The menu page shows the exact products, options and current prices.",
      },
      {
        h: "One basket for collection",
        p: "Mix the confirmed launch menus for collection or kerbside when ordering is available. Delivery is unavailable for this launch. Taconelle, Icova and the other future brands cannot be added until their menus open.",
      },
      {
        h: "Explore the November offers",
        p: "See the Offers page for 30% off the entire menu on 6–8 November, Sunday's 99p milk cake, and the registered-member double-points offer from Monday 9 to Friday 13 November 2026 inclusive.",
      },
    ],
  },
  {
    slug: "office-lunch-delivery-st-albans",
    title: "MealDeck St Albans: Future Office Lunch Plans",
    excerpt:
      "St Albans is a future MealDeck location. Its opening date, delivery area and menu will be confirmed separately. Luton launches first.",
    image: "/blog/st-albans-lunch.jpg",
    date: "2026-09-14",
    rank: "Q",
    suit: "♠",
    tag: "St Albans",
    keywords:
      "lunch delivery St Albans, office lunch St Albans, breakfast delivery St Albans, food delivery St Albans",
    body: [
      {
        p: "St Albans is coming in a future MealDeck deck. No MealDeck orders are being accepted there yet. The opening date, hours, menu and delivery area will be confirmed on the St Albans page before launch.",
      },
      {
        h: "Café1 remains separate",
        p: "Café1’s own counter and dine-in services are independent of MealDeck. A planned future MealDeck menu does not change those services or confirm MealDeck availability.",
      },
      {
        h: "Luton launches first",
        p: "The confirmed first menus are Skorch, Tavo Chicken, Souvano, Load’d and Moktl for Luton collection or kerbside. The wider brand collection includes future menus; it is not a list of currently available St Albans dishes.",
      },
      {
        h: "Feeding the team?",
        p: "Group planning is open for the Luton collection launch. Colleagues choose food and send their picks back to one organiser, who reviews the food and the payment options currently available at checkout. St Albans ordering remains coming soon.",
      },
    ],
  },
  {
    slug: "order-direct-pay-less-than-aggregators",
    title: "Ordering Direct with MealDeck: Food, Offers and One Basket",
    excerpt:
      "Explore MealDeck's menus and the three November offers, with one basket for Luton collection or kerbside pickup.",
    image: "/blog/order-direct.jpg",
    date: "2026-09-07",
    rank: "J",
    suit: "♣",
    tag: "Ordering tips",
    keywords: "order food direct Luton, MealDeck collection, takeaway offers Luton, MealDeck menus",
    body: [
      {
        p: "MealDeck brings the current launch menus, food choices and November offers together on mealdeck.co.uk. Browse the exact products and options before reviewing your basket.",
      },
      {
        h: "One collection, five launch menus",
        p: "Mix Skorch, Tavo Chicken, Souvano, Load’d and Moktl in one basket for Luton collection or kerbside when ordering is available. Delivery is unavailable for this launch.",
      },
      {
        h: "Three November offers",
        p: "30% off the entire menu from 6–8 November; milk cake for 99p with every order on Sunday 8 November; register and spend £15 or more from Monday 9 to Friday 13 November inclusive for double loyalty points. Marketing opt-ins are optional. See the Offers page for details.",
      },
      {
        h: "Review and follow your order",
        p: "Checkout shows current availability and the final total before payment. Once a paid order is confirmed, its private receipt shows kitchen and collection progress. WhatsApp ordering is coming soon.",
      },
    ],
  },
];

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);
