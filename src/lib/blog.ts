import { MEALDECK_OFFERS } from "./mealdeck-offers";

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
    excerpt: "Register and spend £15 or more by and including Friday 13 November 2026 for double loyalty points. Marketing choices stay optional.",
    image: "/blog/loyalty-points.jpg",
    date: "2026-11-05",
    rank: "10",
    suit: "♦",
    tag: "Loyalty",
    keywords: "MealDeck double loyalty points, Luton offers November 2026, MealDeck member offers",
    body: [
      { p: "The November member offer is double loyalty points when you register and spend £15 or more by and including Friday 13 November 2026." },
      { h: "Use your member account", p: "Register with MealDeck, verify your email and use your account. Guest orders do not earn loyalty points." },
      { h: "Your marketing choices are separate", p: "You do not need to sign up for promotional emails or app alerts to qualify. Each channel is an optional choice in your account." },
      { h: "Your points balance", p: "Your account will show points when the loyalty service is available. The earning and redemption details will be published before points are credited; a promotional announcement is not a points balance." },
      { h: "Games are just for fun", p: "MealDeck Play is free and separate from purchase offers. Playing or winning a game does not earn loyalty points, food, cash or discounts." },
    ],
  },
  {
    slug: "house-rules-every-offer-explained",
    title: "House Rules: Every MealDeck Offer, Explained",
    excerpt: "30% off the entire menu, Sunday milk cake for 99p, and double loyalty points. The three November offers, with their dates and details.",
    image: "/blog/offers-explained.jpg",
    date: "2026-11-05",
    rank: "9",
    suit: "♥",
    tag: "Offers",
    keywords: "MealDeck offers Luton, 30 percent off November 2026, 99p milk cake, double loyalty points",
    body: [
      { p: "These are the three MealDeck offers for November 2026. Luton launches first, with collection and kerbside pickup." },
      ...MEALDECK_OFFERS.map(offer => ({ h: `${offer.value} · ${offer.title}`, p: offer.terms.join(" ") })),
      { h: "Opening hours", p: "Friday 6 November: 3pm–11pm. Saturday 7 and Sunday 8 November: 1pm–11pm. All times are UK local time. Check the Offers page for the full details and checkout for current ordering availability." },
    ],
  },
  {
    slug: "deal-everyone-in-group-food-order-luton",
    title: "Deal Everyone In: How to Nail a Group Food Order in Luton",
    excerpt: "Burgers for one, desi for another, French tacos for the table. Here's how to play a group order without the drama — and split the bill fairly.",
    image: "/blog/group-order.jpg",
    date: "2026-09-28",
    rank: "A",
    suit: "♥",
    tag: "Group ordering",
    keywords: "group food order Luton, takeaway Luton, split bill food delivery, food delivery Luton",
    body: [
      { p: "Every group has a wild card. One wants a smash burger, one wants a curry, someone's suddenly 'off carbs'. With most apps that means three orders, three delivery fees and three drivers. With MealDeck in Luton, you deal everyone into one hand." },
      { h: "Shuffle the brands, keep one basket", p: "Add Skorch Burgers, Tarka Box, Taconelle and Tavo Chicken to the same basket. It all goes through one checkout with one delivery fee — no juggling separate orders." },
      { h: "Split the pot, not the friendship", p: "Group ordering lets everyone pick their own items, and split payments mean each player covers their own share. No more 'I'll transfer you later'." },
      { h: "Check the current offers", p: "The November offers are 30% off the entire menu on 6–8 November, milk cake for 99p with every order on Sunday 8 November, and double loyalty points when you register and spend £15 or more by and including Friday 13 November. See the Offers page for details. Guest orders earn no points." },
      { h: "Ready to deal?", p: "Enter your LU postcode on the order page, pick delivery, pickup or kerbside, and build your hand." },
    ],
  },
  {
    slug: "french-tacos-luton-ace-of-the-deck",
    title: "French Tacos in Luton: Meet the Ace of the Deck",
    excerpt: "Grilled, folded, loaded with cheese sauce. Why French tacos from Taconelle and Load'd are Luton's new trump card.",
    image: "/blog/french-taco-luton.jpg",
    date: "2026-09-21",
    rank: "K",
    suit: "♦",
    tag: "Food guide",
    keywords: "French tacos Luton, best French tacos Luton, mac n cheese Luton, late food Luton",
    body: [
      { p: "Not a street taco — a French taco is a big flour wrap, filled with meat, fries and creamy cheese sauce, then folded and pressed on the grill until golden. It's the ace you didn't know your hand was missing." },
      { h: "Two brands, two ways to play", p: "Taconelle brings French tacos with attitude. Load'd pairs them with proper mac n cheese for the full comfort combo." },
      { h: "Make it a full house", p: "Add a Tavo Chicken side, an Icova iced coffee or a Moktl zero-alcohol mocktail — all in one basket with one delivery fee." },
      { h: "Explore the November offers", p: "See the Offers page for 30% off the entire menu on 6–8 November, Sunday's 99p milk cake, and the registered-member double-points offer ending Friday 13 November 2026." },
    ],
  },
  {
    slug: "office-lunch-delivery-st-albans",
    title: "Office Lunch in St Albans? Play Your Cards Right",
    excerpt: "Weekday breakfast and lunch delivery across AL postcodes — Café1 classics, fresh juices, iced chai and more, all in one order.",
    image: "/blog/st-albans-lunch.jpg",
    date: "2026-09-14",
    rank: "Q",
    suit: "♠",
    tag: "St Albans",
    keywords: "lunch delivery St Albans, office lunch St Albans, breakfast delivery St Albans, food delivery St Albans",
    body: [
      { p: "MealDeck St Albans runs Monday to Friday, 09:00–16:00, delivery only — built for desks, meetings and working-from-home lunches." },
      { h: "Café1 is the local card", p: "Café1's British café favourites are exclusive to St Albans. Enter an AL postcode on the order page and it joins the deck." },
      { h: "Fresh juices and iced coffee on the side", p: "Add a Vyta fresh juice or an Icova iced coffee, chai or dessert to any order. One basket, one delivery fee." },
      { h: "Feeding the team?", p: "Use group ordering so colleagues add their own picks, then split payments at checkout." },
    ],
  },
  {
    slug: "order-direct-pay-less-than-aggregators",
    title: "Ordering Direct with MealDeck: Food, Offers and One Basket",
    excerpt: "Explore MealDeck's menus and the three November offers, with one basket for Luton collection or kerbside pickup.",
    image: "/blog/order-direct.jpg",
    date: "2026-09-07",
    rank: "J",
    suit: "♣",
    tag: "Ordering tips",
    keywords: "order food direct Luton, cheaper than Deliveroo Luton, food delivery St Albans, takeaway offers Luton",
    body: [
      { p: "Aggregator apps add their own costs on top. When you order direct with MealDeck, you skip the middleman and keep more value in your hand." },
      { h: "One delivery fee, every brand", p: "Mix as many MealDeck brands as you like and still pay one delivery fee." },
      { h: "Three November offers", p: "30% off the entire menu from 6–8 November; milk cake for 99p with every order on Sunday 8 November; register and spend £15 or more by and including Friday 13 November for double loyalty points. Marketing opt-ins are optional. See the Offers page for details." },
      { h: "Order your way, track every move", p: "Order on the web, app, WhatsApp or phone, then follow your order live from preparation to door." },
    ],
  },
];

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);
