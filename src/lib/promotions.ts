/** Frontend campaign catalogue. These are proposals, not redeemable entitlements.
 * Dishbee must supply and validate live eligibility, prices, budgets and rewards.
 * Money is expressed in integer pence throughout.
 */
export type OfferCategory = "bundles" | "sharing" | "rewards";
export type OfferMechanic = "free-item" | "percentage" | "half-price" | "fixed" | "reward";
export type PromoOffer = {
  id: string;
  name: string;
  headline: string;
  description: string;
  category: OfferCategory;
  mechanic: OfferMechanic;
  minimumPence: number;
  maximumSavingPence?: number;
  featured: boolean;
  imageBrandId: string;
  terms: string[];
};

export const promotionPolicy = {
  mode: "preview",
  maximumFeaturedOffers: 3,
  maximumOffersPerOrder: 1,
  maximumRedemptionsPerCustomerPerDay: 1,
  stackable: false,
  minimumExcludes: ["delivery", "service-fees", "paid-upgrades"],
  excludeAlreadyDiscountedItems: true,
  rewardsIssuedAfterFulfilment: true,
} as const;

export const promoOffers: PromoOffer[] = [
  {
    id: "house-offer",
    name: "House Offer",
    headline: "Coffee. On the house.",
    description: "Spend £21 on food and enjoy a regular Icova iced latte on us.",
    category: "bundles",
    mechanic: "free-item",
    minimumPence: 2100,
    featured: true,
    imageBrandId: "icova",
    terms: [
      "One selected regular iced latte per order.",
      "£21 qualifying food spend; the free drink does not count towards it.",
      "Extra shots, milk upgrades and larger sizes are charged separately.",
    ],
  },
  {
    id: "build-your-deck",
    name: "Build Your Deck",
    headline: "Your three. 20% off.",
    description:
      "Pick a main, a side and a drink from the selected decks. Make it your kind of meal.",
    category: "bundles",
    mechanic: "percentage",
    minimumPence: 2000,
    maximumSavingPence: 500,
    featured: true,
    imageBrandId: "taconelle",
    terms: [
      "Choose exactly one eligible main, one side and one drink.",
      "The selected bundle must reach £20 before discount; unrelated basket items do not count.",
      "20% applies to the selected bundle only, with a maximum £5 saving.",
      "Premium upgrades and extras are excluded from the discount.",
    ],
  },
  {
    id: "snap",
    name: "Snap",
    headline: "Same again. Half price.",
    description:
      "Found your favourite? Buy one selected item and get its identical match half price.",
    category: "bundles",
    mechanic: "half-price",
    minimumPence: 1200,
    maximumSavingPence: 400,
    featured: true,
    imageBrandId: "paratique",
    terms: [
      "£12 qualifying food subtotal before discount.",
      "One matching pair per order, with the same eligible item and size.",
      "Eligible base items cost £8 or less; maximum £4 saving.",
      "Modifiers and extras remain full price.",
    ],
  },
  {
    id: "perfect-pair",
    name: "Perfect Pair",
    headline: "A little better together.",
    description: "Match a selected main with a drink and save £1.",
    category: "bundles",
    mechanic: "fixed",
    minimumPence: 1200,
    maximumSavingPence: 100,
    featured: false,
    imageBrandId: "tavo-chicken",
    terms: [
      "One eligible main-and-drink pair per order.",
      "£12 qualifying food-and-drink spend before discount.",
    ],
  },
  {
    id: "happy-families",
    name: "Happy Families",
    headline: "Different tastes. Same table.",
    description:
      "Choose four selected mains and two sides across the deck. Save £3 on your family feast.",
    category: "sharing",
    mechanic: "fixed",
    minimumPence: 4000,
    maximumSavingPence: 300,
    featured: false,
    imageBrandId: "fyrra",
    terms: [
      "One selected four-main, two-side bundle per order.",
      "The family bundle must reach £40 before discount.",
    ],
  },
  {
    id: "share-the-deck",
    name: "Share the Deck",
    headline: "Bring everyone to the table.",
    description: "A group order with three paying participants unlocks a selected sharing side.",
    category: "sharing",
    mechanic: "free-item",
    minimumPence: 4500,
    featured: false,
    imageBrandId: "loadd",
    terms: [
      "Three or more paid participants and a £45 qualifying combined order.",
      "One approved sharing side for the entire group, not one per participant.",
      "All group payments must be complete before the offer can be applied.",
    ],
  },
  {
    id: "lunch-shuffle",
    name: "Lunch Shuffle",
    headline: "Give lunchtime a new flavour.",
    description: "Save £1 on a rotating selection of weekday lunch combinations.",
    category: "bundles",
    mechanic: "fixed",
    minimumPence: 1200,
    maximumSavingPence: 100,
    featured: false,
    imageBrandId: "tarka-box",
    terms: [
      "Selected lunch bundles of £12 or more.",
      "Monday–Friday, 12:00–15:00, Europe/London time.",
      "The available combinations are displayed before selection; no random rewards.",
    ],
  },
  {
    id: "fresh-pick",
    name: "Fresh Pick",
    headline: "A fresh finish to your meal.",
    description: "Add a selected regular Vyta juice or smoothie to an eligible main and save £1.",
    category: "bundles",
    mechanic: "fixed",
    minimumPence: 1400,
    maximumSavingPence: 100,
    featured: false,
    imageBrandId: "vyta",
    terms: [
      "One selected regular drink with an eligible main.",
      "£14 qualifying food-and-drink minimum; extras charged separately.",
    ],
  },
  {
    id: "first-pick",
    name: "First Pick",
    headline: "Your first taste of the deck.",
    description: "A selected regular drink with your first qualifying £18 order.",
    category: "rewards",
    mechanic: "free-item",
    minimumPence: 1800,
    featured: false,
    imageBrandId: "icova",
    terms: [
      "Once per verified new customer on their first completed order.",
      "£18 paid qualifying spend; the complimentary drink is excluded.",
      "Account eligibility must be verified before redemption.",
    ],
  },
  {
    id: "new-card",
    name: "New Card",
    headline: "Meet your next favourite.",
    description:
      "Try a selected new brand or dish with a complimentary approved dip or small side.",
    category: "bundles",
    mechanic: "free-item",
    minimumPence: 1500,
    featured: false,
    imageBrandId: "sabzora",
    terms: [
      "£15 qualifying spend including the featured new item.",
      "One approved dip or small side from the launch selection.",
      "Limited launch dates, stock and location redemption budget.",
    ],
  },
  {
    id: "complete-your-deck",
    name: "Complete Your Deck",
    headline: "Five brands. A new favourite.",
    description: "Collect five different brand stamps to unlock £2 off a future order.",
    category: "rewards",
    mechanic: "reward",
    minimumPence: 2000,
    maximumSavingPence: 200,
    featured: false,
    imageBrandId: "moktl",
    terms: [
      "Each qualifying fulfilled order must be at least £12; maximum one brand stamp per order.",
      "Collect five distinct brand stamps; repeat purchases from the same brand do not add a new stamp.",
      "The £2 reward requires a future £20 qualifying order and expires 30 days after issue.",
      "Cancelled or refunded qualifying purchases reverse their stamps.",
    ],
  },
  {
    id: "back-in-the-deck",
    name: "Back in the Deck",
    headline: "Your favourites missed you.",
    description: "A personal invitation to enjoy £2 off your next £22 order.",
    category: "rewards",
    mechanic: "fixed",
    minimumPence: 2200,
    maximumSavingPence: 200,
    featured: false,
    imageBrandId: "skorch-burgers",
    terms: [
      "Invited customers with no completed order for at least 30 days.",
      "Valid for seven days after issue; maximum once every 60 days.",
    ],
  },
  {
    id: "pass-the-deck",
    name: "Pass the Deck",
    headline: "Good food is worth sharing.",
    description:
      "Introduce a friend. After their qualifying first order, you each receive £2 for a future meal.",
    category: "rewards",
    mechanic: "reward",
    minimumPence: 2000,
    maximumSavingPence: 200,
    featured: false,
    imageBrandId: "paratique",
    terms: [
      "The friend's first fulfilled order and each reward redemption require £20 qualifying spend.",
      "Maximum three successful referrals per referrer per month.",
      "No self-referrals or duplicate customer identities; rewards are issued after fulfilment.",
      "Cancelled or refunded qualifying purchases reverse unredeemed rewards.",
    ],
  },
  {
    id: "birthday-card",
    name: "Birthday Card",
    headline: "A little birthday cheers.",
    description: "Enjoy a selected regular drink with your birthday-week order.",
    category: "rewards",
    mechanic: "free-item",
    minimumPence: 1500,
    featured: false,
    imageBrandId: "moktl",
    terms: [
      "£15 qualifying paid spend; one regular drink per customer per year.",
      "Birthday must be recorded before the offer period.",
      "Available only during the verified customer's birthday week.",
    ],
  },
  {
    id: "collect-your-deck",
    name: "Collect Your Deck",
    headline: "Pick it up. Save a little.",
    description: "Save £1 on selected £15 collection orders during quieter kitchen hours.",
    category: "bundles",
    mechanic: "fixed",
    minimumPence: 1500,
    maximumSavingPence: 100,
    featured: false,
    imageBrandId: "taconelle",
    terms: [
      "Collection only at participating locations and configured times.",
      "£15 qualifying subtotal; unavailable for delivery or kerbside orders.",
    ],
  },
];

export const featuredOffers = promoOffers
  .filter((offer) => offer.featured)
  .slice(0, promotionPolicy.maximumFeaturedOffers);

export type DeckSlot = "main" | "side" | "drink";
export type DeckChoice = {
  id: string;
  slot: DeckSlot;
  name: string;
  brand: string;
  pricePence: number;
};
export const deckChoices: DeckChoice[] = [
  {
    id: "preview-paratha",
    slot: "main",
    name: "Signature chicken paratha",
    brand: "Paratique",
    pricePence: 1050,
  },
  {
    id: "preview-taco",
    slot: "main",
    name: "Loaded French taco",
    brand: "Taconelle",
    pricePence: 1150,
  },
  {
    id: "preview-grill",
    slot: "main",
    name: "Grilled chicken box",
    brand: "Fyrra",
    pricePence: 1250,
  },
  { id: "preview-fries", slot: "side", name: "Seasoned fries", brand: "Load'd", pricePence: 450 },
  {
    id: "preview-loaded",
    slot: "side",
    name: "Loaded cheese fries",
    brand: "Load'd",
    pricePence: 550,
  },
  {
    id: "preview-sharing",
    slot: "side",
    name: "Sharing loaded fries",
    brand: "Load'd",
    pricePence: 800,
  },
  {
    id: "preview-latte",
    slot: "drink",
    name: "Regular iced latte",
    brand: "Icova",
    pricePence: 450,
  },
  { id: "preview-smoothie", slot: "drink", name: "Mango smoothie", brand: "Vyta", pricePence: 550 },
  {
    id: "preview-mocktail",
    slot: "drink",
    name: "Berry & lime mocktail",
    brand: "Moktl",
    pricePence: 600,
  },
];

/** Display-only quote. Never submit this result as a trusted checkout discount. */
export function quoteDeckPreview(selection: Partial<Record<DeckSlot, string>>) {
  const slots: DeckSlot[] = ["main", "side", "drink"];
  const choices = slots.map((slot) =>
    deckChoices.find((choice) => choice.slot === slot && choice.id === selection[slot]),
  );
  const complete = choices.every((choice) => choice !== undefined);
  const subtotalPence = choices.reduce((sum, choice) => sum + (choice?.pricePence ?? 0), 0);
  const eligible = complete && subtotalPence >= 2000;
  const savingPence = eligible ? Math.min(Math.round(subtotalPence * 0.2), 500) : 0;
  return {
    complete,
    eligible,
    subtotalPence,
    savingPence,
    totalPence: subtotalPence - savingPence,
    shortfallPence: Math.max(0, 2000 - subtotalPence),
  };
}
