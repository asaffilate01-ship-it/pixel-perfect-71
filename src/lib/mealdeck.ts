import brandTavo from "@/assets/brand-tavo.jpg";
import brandLoadd from "@/assets/brand-loadd.jpg";
import brandSkorchd from "@/assets/brand-skorchd.jpg";
import brandTaconelle from "@/assets/brand-taconelle.jpg";
import brandVyta from "@/assets/brand-vyta.jpg";
import brandIcova from "@/assets/brand-icova.jpg";
import brandShawarma from "@/assets/brand-shawarma.jpg";

export type LocationKey = "luton" | "stalbans";

export type Brand = {
  id: string;
  name: string;
  strapline: string;
  tagline: string;
  image: string;
};

export type MenuItem = {
  id: string;
  brandId: string;
  category: string;
  name: string;
  description?: string;
  pricePence: number;
  imageUrl?: string | null;
  allergens?: string[];
};

export type CartLine = MenuItem & { quantity: number };

export type MealDeckLocation = {
  key: LocationKey;
  name: string;
  town: string;
  hoursLabel: string;
  brandIds: string[];
};

export const DELIVERY_FEE_PENCE = 299;

export const brands: Brand[] = [
  {
    id: "tavo",
    name: "Tavo",
    strapline: "Burgers done right",
    tagline: "Big flavour. Bigger moments.",
    image: brandTavo,
  },
  {
    id: "loadd",
    name: "Loadd",
    strapline: "Loaded for more",
    tagline: "Fries loaded and legendary.",
    image: brandLoadd,
  },
  {
    id: "skorchd",
    name: "Skorchd",
    strapline: "Fire meets flavour",
    tagline: "Grilled to perfection.",
    image: brandSkorchd,
  },
  {
    id: "taconelle",
    name: "Taconelle",
    strapline: "Soul tacos",
    tagline: "Tacos with attitude.",
    image: brandTaconelle,
  },
  {
    id: "vyta",
    name: "Vyta",
    strapline: "Fresh living",
    tagline: "Good food. Brighter you.",
    image: brandVyta,
  },
  {
    id: "icova",
    name: "Icova",
    strapline: "Desserts reimagined",
    tagline: "Life tastes sweeter here.",
    image: brandIcova,
  },
  {
    id: "shawarma-grill",
    name: "Shawarma Grill",
    strapline: "Real flavours",
    tagline: "Timeless Middle Eastern taste.",
    image: brandShawarma,
  },
  {
    id: "cafe1",
    name: "Café1",
    strapline: "British café favourites",
    tagline: "All-day comfort classics.",
    image: brandShawarma,
  },
];

export const locations: MealDeckLocation[] = [
  {
    key: "luton",
    name: "MealDeck Luton",
    town: "Luton",
    hoursLabel: "Delivery hours set by the Luton venue",
    brandIds: ["tavo", "loadd", "skorchd", "taconelle", "vyta", "icova", "shawarma-grill"],
  },
  {
    key: "stalbans",
    name: "MealDeck St Albans",
    town: "St Albans",
    hoursLabel: "Mon–Fri · 09:00–16:00 · Delivery only",
    brandIds: ["cafe1"],
  },
];

export function brandById(id: string): Brand | undefined {
  return brands.find((brand) => brand.id === id);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function addItem(lines: CartLine[], item: MenuItem): CartLine[] {
  const existing = lines.find((line) => line.id === item.id);
  if (!existing) return [...lines, { ...item, quantity: 1 }];
  return lines.map((line) =>
    line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
  );
}

export function setQuantity(lines: CartLine[], itemId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.id !== itemId);
  return lines.map((line) => (line.id === itemId ? { ...line, quantity } : line));
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.pricePence * line.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

const cafe1Menu: MenuItem[] = [
  { id: "c1-cheese-flan", brandId: "cafe1", category: "Hot meals", name: "Cheese Flan", description: "Classic Café1 cheese flan with your choice of add-ons.", pricePence: 595 },
  { id: "c1-shepherds-pie", brandId: "cafe1", category: "Hot meals", name: "Shepherd's Pie", description: "Comforting shepherd's pie with optional sides and extras.", pricePence: 795 },
  { id: "c1-lasagne", brandId: "cafe1", category: "Hot meals", name: "Lasagne", description: "Rich oven-baked lasagne with optional sides and extras.", pricePence: 795 },
  { id: "c1-fish-chips", brandId: "cafe1", category: "Hot meals", name: "Fish & Chips", description: "A Café1 classic.", pricePence: 895 },
  { id: "c1-full-english-regular", brandId: "cafe1", category: "All day breakfast", name: "Full English · Regular", description: "All-day full English breakfast.", pricePence: 895 },
  { id: "c1-full-english-large", brandId: "cafe1", category: "All day breakfast", name: "Full English · Large", description: "A larger all-day full English breakfast.", pricePence: 1095 },
  { id: "c1-panini", brandId: "cafe1", category: "Made to order", name: "Panini", description: "Choose from the available fillings.", pricePence: 595 },
  { id: "c1-omelette", brandId: "cafe1", category: "Made to order", name: "Omelette", description: "Build from the full Café1 omelette options.", pricePence: 645 },
  { id: "c1-sandwich", brandId: "cafe1", category: "Made to order", name: "Sandwiches", description: "Freshly made with your choice of filling.", pricePence: 395 },
  { id: "c1-toastie", brandId: "cafe1", category: "Made to order", name: "Toasties", description: "Hot toasted sandwiches with your choice of filling.", pricePence: 495 },
  { id: "c1-salad", brandId: "cafe1", category: "Fresh", name: "Salads", description: "Fresh Café1 salad options.", pricePence: 575 },
  { id: "c1-coffee", brandId: "cafe1", category: "Drinks", name: "Coffee", description: "Choose your favourite Café1 coffee.", pricePence: 295 },
  { id: "c1-quarter-burger", brandId: "cafe1", category: "Burgers", name: "¼ lb Burger", description: "Classic quarter-pound burger with add-ons.", pricePence: 595 },
  { id: "c1-half-burger", brandId: "cafe1", category: "Burgers", name: "½ lb Burger", description: "Double-sized half-pound burger with add-ons.", pricePence: 795 },
  { id: "c1-cornflake-tart", brandId: "cafe1", category: "Desserts", name: "Cornflake Tart", description: "A nostalgic Café1 favourite.", pricePence: 395 },
  { id: "c1-mud-pie", brandId: "cafe1", category: "Desserts", name: "Mud Pie", description: "Rich chocolate dessert.", pricePence: 445 },
];

const lutonMenu: MenuItem[] = [
  { id: "tavo-1", brandId: "tavo", category: "Signature", name: "Classic Smash Burger", description: "Two smashed patties, melted cheese and house sauce.", pricePence: 999 },
  { id: "tavo-2", brandId: "tavo", category: "Signature", name: "Buttermilk Chicken Burger", description: "Crisp buttermilk chicken, slaw and pickles.", pricePence: 949 },
  { id: "loadd-1", brandId: "loadd", category: "Loaded", name: "Loaded Fries", description: "Crisp fries, loaded toppings, serious comfort.", pricePence: 749 },
  { id: "loadd-2", brandId: "loadd", category: "Loaded", name: "Loaded Nachos", description: "Cheese, jalapeños and everything good.", pricePence: 799 },
  { id: "skorchd-1", brandId: "skorchd", category: "Grill", name: "Flame Grilled Wings", description: "Charred, glazed and seriously moreish.", pricePence: 699 },
  { id: "skorchd-2", brandId: "skorchd", category: "Grill", name: "Half Grilled Chicken", description: "Marinated and grilled over fire.", pricePence: 1099 },
  { id: "taconelle-1", brandId: "taconelle", category: "Tacos", name: "Mexican Street Tacos (2)", description: "Bold tacos with fresh toppings.", pricePence: 749 },
  { id: "vyta-1", brandId: "vyta", category: "Fresh", name: "Vyta Power Bowl", description: "Bright, fresh and full of flavour.", pricePence: 799 },
  { id: "icova-1", brandId: "icova", category: "Desserts", name: "Strawberry Dream", description: "Strawberry gelato, sauce and cream.", pricePence: 599 },
  { id: "shawarma-1", brandId: "shawarma-grill", category: "Wraps", name: "Chicken Shawarma Wrap", description: "Grilled chicken, salad and garlic sauce.", pricePence: 849 },
];

export function sampleMenu(location: LocationKey): MenuItem[] {
  return location === "stalbans" ? cafe1Menu : lutonMenu;
}
