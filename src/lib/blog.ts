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
    excerpt: "Everyone chooses from five launch menus, sends their picks back and gets a numbered bag. Here’s how to bring one group order together, with the organiser paying once.",
    image: "/blog/group-order.jpg",
    date: "2026-09-28",
    rank: "A",
    suit: "♥",
    tag: "Group ordering",
    keywords: "group food order Luton, collection Luton, group takeaway, MealDeck invitations",
    body: [
      { p: "Different cravings can share one collection. MealDeck’s group planner brings Skorch, Tavo Chicken, Souvano, Load’d and Moktl into one organiser-reviewed order for Luton collection or kerbside pickup. Delivery is unavailable." },
      { h: "Invite, choose, send back", p: "Start a group on the Group order page and create a separate invitation link for each person. They choose their exact food, flavours, portions and extras, then send a reply link back to you. Open or paste that reply in the browser where you started the group and review it before adding the choices." },
      { h: "One person pays", p: "The organiser checks everyone’s food and pays in one checkout, subject to the kitchen’s live availability and opening hours. Split payments are not available. Replies update that person’s choices instead of adding a duplicate set. The planner is a draft on your browser, not a live synced room; changed choices need a new reply link." },
      { h: "Check the current offers", p: "The November offers are 30% off the entire menu on 6–8 November, milk cake for 99p with every order on Sunday 8 November, and double loyalty points when you register and spend £15 or more by and including Friday 13 November. See the Offers page for details. Guest orders earn no points." },
      { h: "Keep each person’s food together", p: "Review one numbered bag per person before checkout. Names remain in your local draft; the kitchen receives the numbered packing plan. Your personal menu basket stays saved separately. Invitation links let anyone who has them prepare a reply, and reply links reveal food choices, so share them privately and check who sent each reply." },
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
      { h: "Feeding the team?", p: "Group planning is open for the Luton collection launch: colleagues choose their food and send their picks back to one organiser, who reviews and pays. Split payments are unavailable. St Albans ordering remains coming soon." },
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
