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
    title: "Cash In Your Chips: How MealDeck Loyalty Points Work",
    excerpt: "Every order stacks your stack. Here's how MealDeck loyalty points build up across brands, group orders and monthly streaks.",
    image: "/blog/loyalty-points.jpg",
    date: "2026-10-01",
    rank: "10",
    suit: "♦",
    tag: "Loyalty",
    keywords: "food loyalty points Luton, takeaway rewards St Albans, food delivery rewards UK, MealDeck loyalty",
    body: [
      { p: "Most delivery apps let your rewards fold. At MealDeck, every order stacks your stack — points from every brand, sitting in one pot, ready to cash in on your next hand." },
      { h: "One pot, every brand", p: "Order Skorch Burgers tonight and Tarka Box tomorrow — the points land in the same pot. Mix brands in one basket and they all count. That's the beauty of one deck." },
      { h: "Group orders pay double dividends", p: "Deal the whole table in. Group orders with split payments still earn points for you as the host, and our Group Hand bonus adds extra points when you order together." },
      { h: "Keep your streak on the table", p: "Order regularly and multipliers like 10× points on your fifth order of the month come into play. Check the Offers section for the current terms and limits." },
      { h: "Ready to ante up?", p: "Order on the web, app, WhatsApp or phone — every channel earns. Your points, your pot, your play." },
    ],
  },
  {
    slug: "house-rules-every-offer-explained",
    title: "House Rules: Every MealDeck Offer, Explained",
    excerpt: "Snap, Perfect Pair, The Burger Ace — the offers on the table right now, with the limits spelled out so you always play with a full deck.",
    image: "/blog/offers-explained.jpg",
    date: "2026-09-30",
    rank: "9",
    suit: "♥",
    tag: "Offers",
    keywords: "food offers Luton, takeaway deals St Albans, buy one get one half price food, free burger offer UK",
    body: [
      { p: "Card games run on house rules, and so do good offers. Here's every hand MealDeck is dealing right now — with the limits written plainly, so there's no small print ambush at checkout." },
      { h: "The Burger Ace", p: "Spend £21 or more and a burger's on the house. It's our flagship hand: one basket, multiple brands, and a free burger when the total tips over 21." },
      { h: "Snap!", p: "Buy one and get the second of the same item at half price. Two karak chai? Two smash burgers? When the cards match, you snap the second for half." },
      { h: "The Perfect Pair", p: "Two of the same item, one price cut — our 2-for-1 on matching items. Ideal for a table that agrees for once." },
      { h: "The Group Hand and the Three-Brand Trifecta", p: "Group orders earn bonus loyalty points, and baskets that stack three or more brands in one deal take £5 off. Splitting the bill never split the value." },
      { h: "Play it straight", p: "Every offer has clear limits — one deal per order, minimum spends apply, and full terms live on the Offers section. Shuffle up and pick your hand on the order page." },
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
      { h: "Play your loyalty card", p: "Every group order earns loyalty points, and our Group Hand offer adds bonus points when you order together. Check the Offers section for current limits and terms." },
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
      { h: "Order direct", p: "Ordering direct on MealDeck means you can use our own offers and loyalty points. Pop in your LU postcode to see what's live." },
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
    title: "Snap! Why Ordering Direct Beats the Delivery Apps",
    excerpt: "Fewer fees, real loyalty points and full live tracking. Here's why ordering direct with MealDeck is the smarter play.",
    image: "/blog/order-direct.jpg",
    date: "2026-09-07",
    rank: "J",
    suit: "♣",
    tag: "Ordering tips",
    keywords: "order food direct Luton, cheaper than Deliveroo Luton, food delivery St Albans, takeaway offers Luton",
    body: [
      { p: "Aggregator apps add their own costs on top. When you order direct with MealDeck, you skip the middleman and keep more value in your hand." },
      { h: "One delivery fee, every brand", p: "Mix as many MealDeck brands as you like and still pay one delivery fee." },
      { h: "Loyalty that's actually yours", p: "Points from every order, plus offers like The Burger Ace and Perfect Pair — each with clear limits and terms." },
      { h: "Order your way, track every move", p: "Order on the web, app, WhatsApp or phone, then follow your order live from kitchen to door." },
    ],
  },
];

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);
