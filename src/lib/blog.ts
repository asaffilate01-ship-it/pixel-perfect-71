import { MEALDECK_LUTON_HOURS_PROSE } from "./mealdeck-launch-schedule";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  date: string;
  updatedAt?: string;
  rank: string;
  suit: "♥" | "♦" | "♠" | "♣";
  tag: string;
  keywords: string;
  body: { h?: string; p: string }[];
};

export const posts: Post[] = [
  {
    slug: "cash-in-your-chips-loyalty-points",
    title: "MealDeck Loyalty: Earn Points on Eligible Orders",
    excerpt:
      "Verified members earn one point per complete £1 paid after discounts on eligible orders. Marketing choices stay optional.",
    image: "/blog/loyalty-points.jpg",
    date: "2026-11-05",
    updatedAt: "2026-11-26",
    rank: "10",
    suit: "♦",
    tag: "Loyalty",
    keywords: "MealDeck loyalty points, Luton takeaway membership, MealDeck member offers",
    body: [
      {
        p: "Verified registered members earn one loyalty point for each complete £1 actually paid after discounts on eligible orders.",
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
        p: "Your account shows your points balance and qualifying purchases. Refunds, cancellations and disputes can remove points. Points cannot currently be redeemed for cash or purchases.",
      },
      {
        h: "Games are just for fun",
        p: "MealDeck Play is free and separate from purchase offers. Playing or winning a game does not earn loyalty points, food, cash or discounts.",
      },
    ],
  },
  {
    slug: "house-rules-every-offer-explained",
    title: "House Rules: MealDeck Offers and Member Benefits",
    excerpt:
      "Find current member benefits, free local delivery eligibility and the conditions for any limited-time offers.",
    image: "/blog/offers-explained.jpg",
    date: "2026-11-05",
    updatedAt: "2026-11-26",
    rank: "9",
    suit: "♥",
    tag: "Offers",
    keywords:
      "MealDeck offers Luton, member loyalty, local delivery terms",
    body: [
      {
        p: "Order from five MealDeck menus in one basket for collection, kerbside or eligible local delivery in Luton. Check the Offers page for current promotions.",
      },
      {
        h: "Member loyalty",
        p: "Verified members earn one point per complete £1 paid after discounts on eligible orders. Guest orders earn no points. Marketing preferences are optional and separate.",
      },
      {
        h: "Free local delivery",
        p: "Free direct delivery is offered within 4 km of LU4 8NU on orders of £15 or more after discounts. Your postcode, kitchen and driver availability must be confirmed at checkout.",
      },
      {
        h: "Current offers",
        p: "Any limited-time promotion will be published with its own dates and eligibility conditions. Checkout confirms the final total before payment.",
      },
      {
        h: "Opening hours",
        p: `${MEALDECK_LUTON_HOURS_PROSE} Check the Offers page for the full details and checkout for current ordering availability.`,
      },
    ],
  },
  {
    slug: "deal-everyone-in-group-food-order-luton",
    title: "Deal Everyone In: How to Nail a Group Food Order in Luton",
    excerpt:
      "Use a private group room when available, choose food together and review the payment options. The kitchen packs the fully paid order by name.",
    image: "/blog/group-order.jpg",
    date: "2026-09-28",
    updatedAt: "2026-11-26",
    rank: "A",
    suit: "♥",
    tag: "Group ordering",
    keywords: "group food order Luton, collection Luton, group takeaway, MealDeck invitations",
    body: [
      {
        p: "Different cravings can share one order. MealDeck group rooms bring Skorch, Tavo Chicken, Souvano, Load’d and Moktl into one organiser-reviewed order. Check group ordering availability before creating a room.",
      },
      {
        h: "Invite, choose and get ready",
        p: "When group ordering is available, create a private room and share individual invitations. Invitees have three minutes to join. Each participant chooses and saves their food, then marks their choices ready. The organiser reviews the room before locking choices.",
      },
      {
        h: "Review food, then payment",
        p: "The organiser checks everyone's food and itemised bills. The room shows the payment methods currently available: each participant pays for their own food, or the organiser pays the whole bill. The master order reaches the kitchen only after all required payments are verified.",
      },
      {
        h: "Check the current offers",
        p: "Current member benefits and any time-limited offers are listed on the Offers page. Verified members earn points on eligible paid orders. Guest orders earn no points.",
      },
      {
        h: "Keep each person’s food together",
        p: "The kitchen receives each participant's chosen name beside their food to help pack the group order correctly. Share each private invitation only with its intended recipient. Your personal menu basket remains separate.",
      },
    ],
  },
  {
    slug: "french-tacos-luton-ace-of-the-deck",
    title: "French Tacos in Luton: A Future MealDeck Menu",
    excerpt:
      "Taconelle’s French tacos are planned for a future deck. Explore the five Luton menus, including Load’d loaded fries and mac and cheese.",
    image: "/blog/french-taco-luton.jpg",
    date: "2026-09-21",
    updatedAt: "2026-11-26",
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
        h: "Explore the five Luton menus",
        p: "Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails are available to browse. The menu page shows the exact products, options and current prices.",
      },
      {
        h: "One basket, your preferred order method",
        p: "Mix the current menus for eligible local delivery, collection or kerbside when ordering is available. Taconelle, Icova and other future brands cannot be added until their menus open.",
      },
      {
        h: "Explore current member benefits",
        p: "See the Offers page for current member benefits and any limited-time promotions.",
      },
    ],
  },
  {
    slug: "office-lunch-delivery-st-albans",
    title: "MealDeck St Albans: Future Office Lunch Plans",
    excerpt:
      "St Albans is a future MealDeck location. Its opening date, delivery area and menu will be confirmed separately. Orders are currently accepted in Luton when the kitchen is available.",
    image: "/blog/st-albans-lunch.jpg",
    date: "2026-09-14",
    updatedAt: "2026-11-26",
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
        h: "Explore the current Luton menus",
        p: "The current Luton menus are Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Delivery eligibility, collection and kerbside are confirmed at checkout. Future brands do not represent available St Albans dishes.",
      },
      {
        h: "Feeding the team?",
        p: "When Luton group rooms are available, colleagues can join a private room, save their choices and review payment options. St Albans ordering remains coming soon.",
      },
    ],
  },
  {
    slug: "order-direct-pay-less-than-aggregators",
    title: "Ordering Direct with MealDeck: Food, Offers and One Basket",
    excerpt:
      "Explore five menus, current member benefits and one basket for Luton collection, kerbside or eligible local delivery.",
    image: "/blog/order-direct.jpg",
    date: "2026-09-07",
    updatedAt: "2026-11-26",
    rank: "J",
    suit: "♣",
    tag: "Ordering tips",
    keywords: "order food direct Luton, MealDeck collection, takeaway offers Luton, MealDeck menus",
    body: [
      {
        p: "MealDeck brings the current menus, food choices and member benefits together on mealdeck.co.uk. Browse the exact products and options before reviewing your basket.",
      },
      {
        h: "One order, five menus",
        p: "Mix Skorch, Tavo Chicken, Souvano, Load’d and Moktl in one basket for collection, kerbside or eligible local delivery. Checkout confirms availability.",
      },
      {
        h: "Current member benefits and delivery",
        p: "Verified members earn one point per complete £1 paid after discounts on eligible orders. Free direct delivery is offered within 4 km of LU4 8NU on £15+ after discounts, subject to checkout availability. Marketing opt-ins are optional. See the Offers page for current terms.",
      },
      {
        h: "Review and follow your order",
        p: "Checkout shows current availability and the final total before payment. Once a paid order is confirmed, its private receipt shows confirmed kitchen and handover progress. WhatsApp ordering is coming soon.",
      },
    ],
  },
];

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);
