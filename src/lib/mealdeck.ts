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
import logoTaconelle from "@/assets/logos/taconelle.png.asset.json";
import logoIcova from "@/assets/logos/icova.png.asset.json";
import logoParatique from "@/assets/logos/paratique.png.asset.json";
import logoTavo from "@/assets/logos/tavo-chicken.png.asset.json";
import logoSkorch from "@/assets/logos/skorch-burgers.png.asset.json";
import logoLoadd from "@/assets/logos/loadd.png.asset.json";
import logoFyrra from "@/assets/logos/fyrra.png.asset.json";
import logoTarka from "@/assets/logos/tarka-box.png.asset.json";
import logoSabzora from "@/assets/logos/sabzora.png.asset.json";
import logoVyta from "@/assets/logos/vyta.png.asset.json";
import logoMoktl from "@/assets/logos/moktl.png.asset.json";
import { cafe1Menu, coreMenu } from "./sample-menus";

export type LocationKey = "luton" | "stalbans";
export type FulfilmentType = "delivery" | "pickup" | "curbside";

export const fulfilmentLabels: Record<FulfilmentType, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  curbside: "Kerbside",
};

export type Brand = {
  id: string;
  name: string;
  strapline: string;
  tagline: string;
  image: string;
  category: string;
  logo?: string;
  logoVariant?: "standard" | "wide" | "square";
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
  hasModifiers?: boolean | undefined;
};

export type SelectedModifier = { name: string; priceDeltaPence: number };

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
  { id: "tavo-chicken", name: "Tavo Chicken", strapline: "Turn up the flavour.", tagline: "Big flavour. Bigger moments.", image: brandTavo, category: "Chicken", logo: logoTavo.url },
  { id: "paratique", name: "Paratique", strapline: "Signature parathas.", tagline: "Layered, loaded, lovely.", image: brandParatique, category: "Parathas", logo: logoParatique.url },
  { id: "taconelle", name: "Taconelle", strapline: "Beautifully loaded.", tagline: "French tacos with attitude.", image: brandTaconelle, category: "French tacos", logo: logoTaconelle.url, logoVariant: "square" },
  { id: "loadd", name: "Load'd", strapline: "Fries, taken further.", tagline: "Fries loaded and legendary.", image: brandLoadd, category: "Loaded fries", logo: logoLoadd.url },
  { id: "vyta", name: "Vyta", strapline: "Natural nutrition for a brighter you.", tagline: "Good food. Brighter you.", image: brandVyta, category: "Nutrition", logo: logoVyta.url },
  { id: "tarka-box", name: "Tarka Box", strapline: "Big flavour. Boxed.", tagline: "Curry, chaat and street eats.", image: brandTarka, category: "Curry · chaat · street", logo: logoTarka.url },
  { id: "fyrra", name: "Fyrra", strapline: "Bold flavours. Together.", tagline: "Grill, shawarma and kebab.", image: brandFyrra, category: "Grill · shawarma · kebab", logo: logoFyrra.url },
  { id: "sabzora", name: "Sabzora", strapline: "Indian veg delights.", tagline: "Plants with personality.", image: brandSabzora, category: "Indian vegetarian", logo: logoSabzora.url, logoVariant: "square" },
  { id: "skorch-burgers", name: "Skorch Burgers", strapline: "Seared on steel.", tagline: "Smashed, seared, sensational.", image: brandSkorch, category: "Smash burgers", logo: logoSkorch.url },
  { id: "cafe1", name: "Café1", strapline: "British café favourites", tagline: "All-day comfort classics.", image: brandCafe1, category: "Café" },
  { id: "icova", name: "Icova", strapline: "Better over ice.", tagline: "Iced coffee, chai and matcha.", image: brandIcova, category: "Iced coffee · chai · matcha", logo: logoIcova.url, logoVariant: "wide" },
  { id: "moktl", name: "Moktl", strapline: "Zero alcohol. Full vibe.", tagline: "Mocktails made to impress.", image: brandMoktl, category: "Zero alcohol", logo: logoMoktl.url, logoVariant: "wide" },
];

export const primaryBrandIds = ["tavo-chicken", "paratique", "taconelle", "loadd", "vyta", "tarka-box", "fyrra", "sabzora", "skorch-burgers"];
export const addonBrandIds = ["icova", "moktl"];

export const locations: MealDeckLocation[] = [
  { key: "luton", name: "MealDeck Luton", town: "Luton", hoursLabel: "Opening hours set by the Luton kitchen", primaryBrandIds, addonBrandIds, allowedFulfilments: ["delivery", "pickup", "curbside"] },
  { key: "stalbans", name: "MealDeck St Albans", town: "St Albans", hoursLabel: "Mon–Fri · 09:00–16:00 · Delivery only", primaryBrandIds: ["cafe1", ...primaryBrandIds], addonBrandIds, allowedFulfilments: ["delivery"] },
];

export function brandById(id: string): Brand | undefined {
  return brands.find((brand) => brand.id === id);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function resolveSampleServiceability(
  postcode: string,
  fulfilment: FulfilmentType,
): { locationKey?: LocationKey; message: string } {
  const normalized = postcode.toUpperCase().replace(/\s+/g, "");
  if (normalized.startsWith("LU")) return { locationKey: "luton", message: "Great news — MealDeck Luton serves your area." };
  if (normalized.startsWith("AL")) {
    if (fulfilment !== "delivery") return { message: "MealDeck St Albans currently offers delivery only. Choose Delivery to continue." };
    return { locationKey: "stalbans", message: "Great news — MealDeck St Albans serves your area." };
  }
  return { message: "Sorry, MealDeck doesn't serve your area yet. We're expanding quickly — please check back soon." };
}

export function modifierOptionsFor(item: MenuItem): SelectedModifier[] {
  if (item.brandId === "icova") return [{ name: "Large", priceDeltaPence: 100 }, { name: "Oat milk", priceDeltaPence: 50 }, { name: "Extra shot", priceDeltaPence: 60 }, { name: "Less ice", priceDeltaPence: 0 }];
  if (item.brandId === "moktl") return [{ name: "Large", priceDeltaPence: 100 }, { name: "Extra fruit", priceDeltaPence: 75 }, { name: "Less ice", priceDeltaPence: 0 }];
  if (item.brandId === "cafe1") return [{ name: "Add chips", priceDeltaPence: 175 }, { name: "Add beans", priceDeltaPence: 125 }, { name: "Extra cheese", priceDeltaPence: 100 }, { name: "No onions", priceDeltaPence: 0 }];
  return [{ name: "Extra cheese", priceDeltaPence: 100 }, { name: "Extra sauce", priceDeltaPence: 50 }, { name: "Make it spicy", priceDeltaPence: 0 }, { name: "No onions", priceDeltaPence: 0 }];
}

export function lineUnitPrice(line: Pick<CartLine, "pricePence" | "selectedModifiers">): number {
  return line.pricePence + line.selectedModifiers.reduce((sum, m) => sum + m.priceDeltaPence, 0);
}

export function addItem(lines: CartLine[], item: MenuItem, selectedModifiers: SelectedModifier[] = []): CartLine[] {
  const signature = selectedModifiers.map((m) => `${m.name}:${m.priceDeltaPence}`).sort().join("|");
  const lineId = `${item.id}:${signature}`;
  const existing = lines.find((line) => line.lineId === lineId);
  if (!existing) return [...lines, { ...item, lineId, quantity: 1, selectedModifiers }];
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + 1 } : line));
}

export function setQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.lineId !== lineId);
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity } : line));
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function sampleMenu(location: LocationKey): MenuItem[] {
  return location === "stalbans" ? [...cafe1Menu, ...coreMenu] : coreMenu;
}
