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
  description?: string | undefined;
  pricePence: number;
  imageUrl?: string | null | undefined;
  allergens?: string[] | undefined;
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
  { id: "taconelle", name: "Taconelle", strapline: "Street tacos with flair", tagline: "Tacos with attitude.", image: brandTaconelle },
  { id: "icova", name: "Icova", strapline: "Desserts, bakes & coffee bliss", tagline: "Life tastes sweeter here.", image: brandIcova },
  { id: "paratique", name: "Paratique", strapline: "Café comfort with a polished twist", tagline: "Brunch, done beautifully.", image: brandParatique },
  { id: "tavo-chicken", name: "Tavo Chicken", strapline: "Chicken, done properly", tagline: "Big flavour. Bigger moments.", image: brandTavo },
  { id: "skorch-burgers", name: "Skorch Burgers", strapline: "Smash burgers with fire", tagline: "Smashed, seared, sensational.", image: brandSkorch },
  { id: "loadd", name: "Load'd", strapline: "Loaded and legendary", tagline: "Fries loaded and legendary.", image: brandLoadd },
  { id: "fyrra", name: "Fyrra", strapline: "Fired up flavour", tagline: "Straight from the flame.", image: brandFyrra },
  { id: "tarka-box", name: "Tarka Box", strapline: "Boxed flavour, fast", tagline: "Spice, rice and everything nice.", image: brandTarka },
  { id: "sabzora", name: "Sabzora", strapline: "Vibrant veg, bold taste", tagline: "Plants with personality.", image: brandSabzora },
  { id: "vyta", name: "Vyta", strapline: "Fresh, vibrant, plant-powered", tagline: "Good food. Brighter you.", image: brandVyta },
  { id: "moktl", name: "Moktl", strapline: "Zero proof. Full mood.", tagline: "Mocktails made to impress.", image: brandMoktl },
  { id: "cafe1", name: "Café1", strapline: "British café favourites", tagline: "All-day comfort classics.", image: brandCafe1 },
];

const coreBrandIds = ["taconelle", "icova", "paratique", "tavo-chicken", "skorch-burgers", "loadd", "fyrra", "tarka-box", "sabzora", "vyta", "moktl"];

export const locations: MealDeckLocation[] = [
  { key: "luton", name: "MealDeck Luton", town: "Luton", hoursLabel: "Delivery hours set by the Luton venue", brandIds: coreBrandIds },
  { key: "stalbans", name: "MealDeck St Albans", town: "St Albans", hoursLabel: "Mon–Fri · 09:00–16:00 · Delivery only", brandIds: ["cafe1", ...coreBrandIds] },
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

const coreMenu: MenuItem[] = [
  { id: "taconelle-1", brandId: "taconelle", category: "Tacos", name: "Street Taco Trio", description: "Three loaded tacos with fresh salsa and house finish.", pricePence: 849 },
  { id: "icova-1", brandId: "icova", category: "Desserts", name: "Signature Dessert Cup", description: "Layered sweet finish from the Icova counter.", pricePence: 499 },
  { id: "icova-2", brandId: "icova", category: "Coffee", name: "Iced Latte", description: "Smooth coffee served the Icova way.", pricePence: 395 },
  { id: "paratique-1", brandId: "paratique", category: "Brunch", name: "Paratique Club Toastie", description: "A polished café-style toastie with signature filling.", pricePence: 695 },
  { id: "tavo-1", brandId: "tavo-chicken", category: "Chicken", name: "Tavo Chicken Wrap", description: "Tender seasoned chicken, sauce and salad in a warm wrap.", pricePence: 899 },
  { id: "skorch-1", brandId: "skorch-burgers", category: "Burgers", name: "Double Smash Burger", description: "Two smashed patties, melted cheese and house sauce.", pricePence: 999 },
  { id: "loadd-1", brandId: "loadd", category: "Loaded", name: "Loaded Fries", description: "Crisp fries piled high with sauces and toppings.", pricePence: 749 },
  { id: "fyrra-1", brandId: "fyrra", category: "Fire grill", name: "Fyrra Fire Bowl", description: "A fired-up bowl built around bold grilled flavour.", pricePence: 899 },
  { id: "tarka-1", brandId: "tarka-box", category: "Box meals", name: "Tarka Rice Box", description: "Fast comfort in a box with layered spice and sauce.", pricePence: 845 },
  { id: "sabzora-1", brandId: "sabzora", category: "Veg", name: "Sabzora Mezze Bowl", description: "Bright vegetables, grains and herb-led flavour.", pricePence: 799 },
  { id: "vyta-1", brandId: "vyta", category: "Fresh", name: "Vyta Power Bowl", description: "Fresh, vibrant and plant-powered.", pricePence: 799 },
  { id: "moktl-1", brandId: "moktl", category: "Drinks", name: "Citrus Spritz", description: "A zero-proof lift with fresh citrus and sparkle.", pricePence: 425 },
];

export function sampleMenu(location: LocationKey): MenuItem[] {
  return location === "stalbans" ? [...cafe1Menu, ...coreMenu] : coreMenu;
}
