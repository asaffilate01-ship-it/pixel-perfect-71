import brandTavo from "@/assets/brand-tavo.jpg";
import brandLoadd from "@/assets/brand-loadd.jpg";
import brandSkorch from "@/assets/brand-skorchd.jpg";
import brandTaconelle from "@/assets/brand-taconelle.jpg";
import brandVyta from "@/assets/brand-vyta.jpg";
import brandIcova from "@/assets/brand-icova.jpg";
import brandParatique from "@/assets/brand-paratique.jpg";
import brandFyrra from "@/assets/brand-fyrra.jpg";
import brandTarka from "@/assets/brand-tarka.jpg";
import brandSabzora from "@/assets/brand-sabzora.jpg";
import brandMoktl from "@/assets/brand-moktl.jpg";
import brandCafe1 from "@/assets/brand-cafe1.jpg";

export type LocationKey = "luton" | "stalbans";
export type FulfilmentType = "delivery" | "pickup" | "curbside";

export type Brand = {
  id: string;
  name: string;
  strapline: string;
  tagline: string;
  image: string;
};

export type ModifierOption = {
  id: string;
  name: string;
  priceDeltaPence: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};

export type SelectedModifier = ModifierOption & {
  groupId: string;
  groupName: string;
};

export type MenuItem = {
  id: string;
  brandId: string;
  category: string;
  name: string;
  description?: string | undefined;
  pricePence: number;
  imageUrl?: string | null | undefined;
  allergens?: string[] | undefined;
  modifierGroups?: ModifierGroup[] | undefined;
};

export type CartLine = MenuItem & {
  lineId: string;
  quantity: number;
  selectedModifiers: SelectedModifier[];
};

export type MealDeckLocation = {
  key: LocationKey;
  name: string;
  town: string;
  hoursLabel: string;
  primaryBrandIds: string[];
  addonBrandIds: string[];
  allowedFulfilments: FulfilmentType[];
};

export const DELIVERY_FEE_PENCE = 299;

export const brands: Brand[] = [
  {
    id: "tavo-chicken",
    name: "Tavo Chicken",
    strapline: "Turn up the flavour",
    tagline: "Chicken, done properly.",
    image: brandTavo,
  },
  {
    id: "paratique",
    name: "Paratique",
    strapline: "Signature parathas",
    tagline: "Layered, filled and made for cravings.",
    image: brandParatique,
  },
  {
    id: "taconelle",
    name: "Taconelle",
    strapline: "Beautifully loaded",
    tagline: "French tacos packed with flavour.",
    image: brandTaconelle,
  },
  {
    id: "loadd",
    name: "Load'd",
    strapline: "Fries, taken further",
    tagline: "Loaded comfort food, built your way.",
    image: brandLoadd,
  },
  {
    id: "vyta",
    name: "Vyta",
    strapline: "Natural nutrition",
    tagline: "Fresh food for a brighter you.",
    image: brandVyta,
  },
  {
    id: "tarka-box",
    name: "Tarka Box",
    strapline: "Big flavour. Boxed.",
    tagline: "Curry, chaat and street-food comfort.",
    image: brandTarka,
  },
  {
    id: "fyrra",
    name: "Fyrra",
    strapline: "Bold flavours. Together.",
    tagline: "Grill, shawarma and kebab favourites.",
    image: brandFyrra,
  },
  {
    id: "sabzora",
    name: "Sabzora",
    strapline: "Indian veg delights",
    tagline: "Vegetarian favourites with real character.",
    image: brandSabzora,
  },
  {
    id: "skorch-burgers",
    name: "Skorch Burgers",
    strapline: "Smash burgers with fire",
    tagline: "Smashed, seared and built to hit the spot.",
    image: brandSkorch,
  },
  {
    id: "icova",
    name: "Icova",
    strapline: "Better over ice",
    tagline: "Iced coffee, chai and matcha add-ons.",
    image: brandIcova,
  },
  {
    id: "moktl",
    name: "Moktl",
    strapline: "Zero alcohol. Full vibe.",
    tagline: "Premium zero-proof drinks for every basket.",
    image: brandMoktl,
  },
  {
    id: "cafe1",
    name: "Café1",
    strapline: "British café favourites",
    tagline: "All-day comfort classics.",
    image: brandCafe1,
  },
];

export const lutonPrimaryBrandIds = [
  "tavo-chicken",
  "paratique",
  "taconelle",
  "loadd",
  "vyta",
  "tarka-box",
  "fyrra",
  "sabzora",
  "skorch-burgers",
];

export const addonBrandIds = ["icova", "moktl"];

export const locations: MealDeckLocation[] = [
  {
    key: "luton",
    name: "MealDeck Luton",
    town: "Luton",
    hoursLabel: "Opening hours are set by the Luton kitchen",
    primaryBrandIds: lutonPrimaryBrandIds,
    addonBrandIds,
    allowedFulfilments: ["delivery", "pickup", "curbside"],
  },
  {
    key: "stalbans",
    name: "MealDeck St Albans",
    town: "St Albans",
    hoursLabel: "Mon–Fri · 09:00–16:00 · Delivery only",
    primaryBrandIds: ["cafe1", ...lutonPrimaryBrandIds],
    addonBrandIds,
    allowedFulfilments: ["delivery"],
  },
];

export function locationByKey(key: LocationKey): MealDeckLocation {
  return locations.find((location) => location.key === key)!;
}

export function allBrandIdsForLocation(key: LocationKey): string[] {
  const location = locationByKey(key);
  return [...location.primaryBrandIds, ...location.addonBrandIds];
}

export function primaryBrandsForLocation(key: LocationKey): Brand[] {
  const ids = new Set(locationByKey(key).primaryBrandIds);
  return brands.filter((brand) => ids.has(brand.id));
}

export function addonBrandsForLocation(key: LocationKey): Brand[] {
  const ids = new Set(locationByKey(key).addonBrandIds);
  return brands.filter((brand) => ids.has(brand.id));
}

export function brandById(id: string): Brand | undefined {
  return brands.find((brand) => brand.id === id);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function fulfilmentFeePence(fulfilment: FulfilmentType): number {
  return fulfilment === "delivery" ? DELIVERY_FEE_PENCE : 0;
}

export const fulfilmentLabels: Record<FulfilmentType, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  curbside: "Kerbside",
};

function modifierSignature(modifiers: SelectedModifier[]): string {
  return modifiers
    .map((modifier) => modifier.id)
    .sort()
    .join("-");
}

export function addItem(
  lines: CartLine[],
  item: MenuItem,
  selectedModifiers: SelectedModifier[] = [],
): CartLine[] {
  const lineId = `${item.id}::${modifierSignature(selectedModifiers) || "standard"}`;
  const existing = lines.find((line) => line.lineId === lineId);
  if (!existing) {
    return [...lines, { ...item, lineId, quantity: 1, selectedModifiers }];
  }
  return lines.map((line) =>
    line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line,
  );
}

export function setQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.lineId !== lineId);
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity } : line));
}

export function lineUnitPrice(line: CartLine): number {
  return (
    line.pricePence +
    line.selectedModifiers.reduce((sum, modifier) => sum + modifier.priceDeltaPence, 0)
  );
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

const sauceGroup: ModifierGroup = {
  id: "sauce",
  name: "Choose your sauce",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: "house", name: "House sauce", priceDeltaPence: 0 },
    { id: "garlic", name: "Garlic sauce", priceDeltaPence: 0 },
    { id: "hot", name: "Hot sauce", priceDeltaPence: 0 },
  ],
};

const heatGroup: ModifierGroup = {
  id: "heat",
  name: "Heat level",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: "mild", name: "Mild", priceDeltaPence: 0 },
    { id: "medium", name: "Medium", priceDeltaPence: 0 },
    { id: "hot", name: "Hot", priceDeltaPence: 0 },
  ],
};

const cafeSidesGroup: ModifierGroup = {
  id: "cafe-sides",
  name: "Add a side",
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: "chips", name: "Chips", priceDeltaPence: 0 },
    { id: "beans", name: "Beans", priceDeltaPence: 0 },
    { id: "salad", name: "Side salad", priceDeltaPence: 0 },
  ],
};

const eggGroup: ModifierGroup = {
  id: "egg-style",
  name: "Egg style",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: "fried", name: "Fried", priceDeltaPence: 0 },
    { id: "scrambled", name: "Scrambled", priceDeltaPence: 0 },
  ],
};

const cafe1Menu: MenuItem[] = [
  {
    id: "c1-cheese-flan",
    brandId: "cafe1",
    category: "Hot meals",
    name: "Cheese Flan",
    description: "Classic Café1 cheese flan with your choice of add-ons.",
    pricePence: 595,
    modifierGroups: [cafeSidesGroup],
  },
  {
    id: "c1-shepherds-pie",
    brandId: "cafe1",
    category: "Hot meals",
    name: "Shepherd's Pie",
    description: "Comforting shepherd's pie with optional sides and extras.",
    pricePence: 795,
    modifierGroups: [cafeSidesGroup],
  },
  {
    id: "c1-lasagne",
    brandId: "cafe1",
    category: "Hot meals",
    name: "Lasagne",
    description: "Rich oven-baked lasagne with optional sides and extras.",
    pricePence: 795,
    modifierGroups: [cafeSidesGroup],
  },
  {
    id: "c1-fish-chips",
    brandId: "cafe1",
    category: "Hot meals",
    name: "Fish & Chips",
    description: "A Café1 classic.",
    pricePence: 895,
  },
  {
    id: "c1-full-english-regular",
    brandId: "cafe1",
    category: "All day breakfast",
    name: "Full English · Regular",
    description: "All-day full English breakfast.",
    pricePence: 895,
    modifierGroups: [eggGroup],
  },
  {
    id: "c1-full-english-large",
    brandId: "cafe1",
    category: "All day breakfast",
    name: "Full English · Large",
    description: "A larger all-day full English breakfast.",
    pricePence: 1095,
    modifierGroups: [eggGroup],
  },
  {
    id: "c1-panini",
    brandId: "cafe1",
    category: "Made to order",
    name: "Panini",
    description: "Choose from the available fillings.",
    pricePence: 595,
  },
  {
    id: "c1-omelette",
    brandId: "cafe1",
    category: "Made to order",
    name: "Omelette",
    description: "Build from the full Café1 omelette options.",
    pricePence: 645,
  },
  {
    id: "c1-sandwich",
    brandId: "cafe1",
    category: "Made to order",
    name: "Sandwiches",
    description: "Freshly made with your choice of filling.",
    pricePence: 395,
  },
  {
    id: "c1-toast",
    brandId: "cafe1",
    category: "Made to order",
    name: "Toast",
    description: "Simple, fresh and made to order.",
    pricePence: 250,
  },
  {
    id: "c1-toastie",
    brandId: "cafe1",
    category: "Made to order",
    name: "Toasties",
    description: "Hot toasted sandwiches with your choice of filling.",
    pricePence: 495,
  },
  {
    id: "c1-salad",
    brandId: "cafe1",
    category: "Fresh",
    name: "Salads",
    description: "Fresh Café1 salad options.",
    pricePence: 575,
  },
  {
    id: "c1-coffee",
    brandId: "cafe1",
    category: "Drinks",
    name: "Coffee",
    description: "Choose your favourite Café1 coffee.",
    pricePence: 295,
  },
  {
    id: "c1-quarter-burger",
    brandId: "cafe1",
    category: "Burgers",
    name: "¼ lb Burger",
    description: "Classic quarter-pound burger with add-ons.",
    pricePence: 595,
    modifierGroups: [sauceGroup],
  },
  {
    id: "c1-half-burger",
    brandId: "cafe1",
    category: "Burgers",
    name: "½ lb Burger",
    description: "Double-sized half-pound burger with add-ons.",
    pricePence: 795,
    modifierGroups: [sauceGroup],
  },
  {
    id: "c1-cornflake-tart",
    brandId: "cafe1",
    category: "Desserts",
    name: "Cornflake Tart",
    description: "A nostalgic Café1 favourite.",
    pricePence: 395,
  },
  {
    id: "c1-mud-pie",
    brandId: "cafe1",
    category: "Desserts",
    name: "Mud Pie",
    description: "Rich chocolate dessert.",
    pricePence: 445,
  },
];

const coreMenu: MenuItem[] = [
  {
    id: "tavo-1",
    brandId: "tavo-chicken",
    category: "Chicken",
    name: "Tavo Chicken Wrap",
    description: "Tender seasoned chicken, sauce and salad in a warm wrap.",
    pricePence: 899,
    modifierGroups: [sauceGroup, heatGroup],
  },
  {
    id: "paratique-1",
    brandId: "paratique",
    category: "Parathas",
    name: "Paratique Signature Roll",
    description: "Layered paratha with signature filling and sauce.",
    pricePence: 845,
    modifierGroups: [sauceGroup],
  },
  {
    id: "taconelle-1",
    brandId: "taconelle",
    category: "French tacos",
    name: "Beautifully Loaded Taco",
    description: "Loaded French taco packed with sauce, fillings and crunch.",
    pricePence: 949,
    modifierGroups: [sauceGroup],
  },
  {
    id: "loadd-1",
    brandId: "loadd",
    category: "Loaded fries",
    name: "Royal Loaded Fries",
    description: "Crisp fries piled high with sauces and toppings.",
    pricePence: 749,
    modifierGroups: [sauceGroup],
  },
  {
    id: "vyta-1",
    brandId: "vyta",
    category: "Nutrition",
    name: "Vyta Nourish Bowl",
    description: "Fresh, natural nutrition built around clean ingredients.",
    pricePence: 799,
  },
  {
    id: "tarka-1",
    brandId: "tarka-box",
    category: "Box meals",
    name: "Tarka Curry Box",
    description: "Fast comfort in a box with layered spice and sauce.",
    pricePence: 845,
    modifierGroups: [heatGroup],
  },
  {
    id: "fyrra-1",
    brandId: "fyrra",
    category: "Shawarma",
    name: "Fyrra Shawarma Wrap",
    description: "Bold shawarma flavour with grill-finished character.",
    pricePence: 895,
    modifierGroups: [sauceGroup],
  },
  {
    id: "sabzora-1",
    brandId: "sabzora",
    category: "Vegetarian",
    name: "Sabzora Veg Delight Box",
    description: "Indian vegetarian comfort with vibrant herb and spice notes.",
    pricePence: 825,
    modifierGroups: [heatGroup],
  },
  {
    id: "skorch-1",
    brandId: "skorch-burgers",
    category: "Burgers",
    name: "Double Smash Burger",
    description: "Two smashed patties, melted cheese and house sauce.",
    pricePence: 999,
    modifierGroups: [sauceGroup],
  },
];

const addonMenu: MenuItem[] = [
  {
    id: "icova-1",
    brandId: "icova",
    category: "Coffee & iced drinks",
    name: "Iced Latte",
    description: "Smooth coffee served the Icova way.",
    pricePence: 395,
  },
  {
    id: "icova-2",
    brandId: "icova",
    category: "Coffee & iced drinks",
    name: "Iced Matcha",
    description: "Bright matcha over ice.",
    pricePence: 425,
  },
  {
    id: "moktl-1",
    brandId: "moktl",
    category: "Zero-proof drinks",
    name: "Signature Citrus Cooler",
    description: "Zero alcohol refreshment with a full-vibe finish.",
    pricePence: 425,
  },
];

export function sampleMenu(location: LocationKey): MenuItem[] {
  const primary = location === "stalbans" ? [...cafe1Menu, ...coreMenu] : coreMenu;
  return [...primary, ...addonMenu];
}
