import brandTavo from "@/assets/brand-tavo.jpg";
import brandLoadd from "@/assets/brand-loadd.jpg";
import brandSkorch from "@/assets/brand-skorchd.jpg";
import brandTaconelle from "@/assets/brand-taconelle.jpg";
import brandVyta from "@/assets/brand-vyta.jpg";
import brandIcova from "@/assets/brand-icova.jpg";
import brandParatique from "@/assets/brand-paratique.jpg";
import brandTarka from "@/assets/brand-tarka.jpg";
import brandSabzora from "@/assets/brand-sabzora.jpg";
import brandMoktl from "@/assets/brand-moktl.jpg";
import brandCafe1 from "@/assets/brand-cafe1.jpg";
import brandForvello from "@/assets/brand-forvello.jpg";
import logoTaconelle from "@/assets/premium-logos/taconelle-premium.png";
import logoIcova from "@/assets/premium-logos/icova-premium.png";
import logoParatique from "@/assets/premium-logos/paratique-premium.png";
import logoTavo from "@/assets/premium-logos/tavo-chicken-premium.png";
import logoSkorch from "@/assets/premium-logos/skorch-premium.png";
import logoLoadd from "@/assets/premium-logos/loadd-premium.png";
import logoTarka from "@/assets/premium-logos/tarka-box-premium.png";
import logoSabzora from "@/assets/premium-logos/sabzora-premium.png";
import logoVyta from "@/assets/premium-logos/vyta-premium.png";
import logoMoktl from "@/assets/premium-logos/moktl-premium.png";
import logoCafe1 from "@/assets/cafe1-logo.png";
import brandPastarivo from "@/assets/brand-pastarivo.jpg";
import brandNusara from "@/assets/brand-nusara.jpg";
import brandRise from "@/assets/brand-rise-griddle.jpg";
import brandSouvano from "@/assets/brand-souvano.jpg";
import logoPastarivo from "@/assets/premium-logos/pastarivo-premium.png";
import logoNusara from "@/assets/premium-logos/nusara-premium.png";
import logoRise from "@/assets/premium-logos/rise-and-griddle-premium.png";
import logoSouvano from "@/assets/premium-logos/souvano-premium.png";
import logoForvelloAsset from "@/assets/premium-logos/forvello-logo.png.asset.json";
import { cafe1Menu, coreMenu } from "./sample-menus";

export type LocationKey = "luton" | "stalbans";
export type FulfilmentType = "delivery" | "pickup" | "curbside" | "dinein";

export const fulfilmentLabels: Record<FulfilmentType, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  curbside: "Kerbside",
  dinein: "Dine in",
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
  modifierGroups?: ModifierGroup[] | undefined;
};

export type SelectedModifier = ModifierOption & {
  groupId: string;
  groupName: string;
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
  { id: "tavo-chicken", name: "Tavo Chicken", strapline: "Turn up the flavour.", tagline: "Big flavour. Bigger moments.", image: brandTavo, category: "All things chicken", logo: logoTavo },
  { id: "paratique", name: "Paratique", strapline: "Signature parathas.", tagline: "Layered, loaded, lovely.", image: brandParatique, category: "Parathas", logo: logoParatique },
  { id: "taconelle", name: "Taconelle", strapline: "Beautifully loaded.", tagline: "French tacos with attitude.", image: brandTaconelle, category: "French tacos", logo: logoTaconelle },
  { id: "loadd", name: "Load'd", strapline: "Folded, loaded, cheesy.", tagline: "French tacos and mac n cheese.", image: brandLoadd, category: "French tacos · mac n cheese", logo: logoLoadd },
  { id: "vyta", name: "Vyta", strapline: "Fresh juices for a brighter you.", tagline: "Good food. Brighter you.", image: brandVyta, category: "Fresh juices", logo: logoVyta },
  { id: "tarka-box", name: "Tarka Box", strapline: "Big flavour. Boxed.", tagline: "Desi classics, done right.", image: brandTarka, category: "Desi food", logo: logoTarka },
  { id: "sabzora", name: "Sabzora", strapline: "Indian veg delights.", tagline: "Plants with personality.", image: brandSabzora, category: "Indian vegetarian", logo: logoSabzora },
  { id: "skorch-burgers", name: "Skorch Burgers", strapline: "Seared on steel.", tagline: "Smashed, seared, sensational.", image: brandSkorch, category: "Smash burgers", logo: logoSkorch },
  { id: "cafe1", name: "Café1", strapline: "Café Classics", tagline: "All-day comfort classics.", image: brandCafe1, category: "Café Classics", logo: logoCafe1 },
  { id: "icova", name: "Icova", strapline: "Better over ice.", tagline: "Iced coffee, chai and desserts.", image: brandIcova, category: "Iced coffee · chai · desserts", logo: logoIcova },
  { id: "moktl", name: "Moktl", strapline: "Zero alcohol. Full vibe.", tagline: "Mocktails made to impress.", image: brandMoktl, category: "Zero-alcohol mocktails", logo: logoMoktl },
  { id: "forvello", name: "Forvello", strapline: "The art of great pizza.", tagline: "Artisan pizza, beautifully crafted.", image: brandForvello, category: "Artisan Pizza", logo: logoForvelloAsset.url },
  { id: "pastarivo", name: "Pastarivo", strapline: "Fresh pasta, freshly tossed.", tagline: "Pasta plates worth twirling.", image: brandPastarivo, category: "Fresh pasta", logo: logoPastarivo },
  { id: "nusara", name: "Nusara", strapline: "South East Asian fusion.", tagline: "Bold bowls, bright flavours.", image: brandNusara, category: "South East Asian fusion", logo: logoNusara },
  { id: "rise-and-griddle", name: "Rise & Griddle", strapline: "Breakfast & brunch.", tagline: "Stacks, eggs and good mornings.", image: brandRise, category: "Breakfast & brunch", logo: logoRise },
  { id: "souvano", name: "Souvano", strapline: "Eastern Mediterranean grill.", tagline: "Fire-grilled and generous.", image: brandSouvano, category: "Eastern Mediterranean grill", logo: logoSouvano },
];

export const primaryBrandIds = ["tavo-chicken", "paratique", "taconelle", "loadd", "vyta", "tarka-box", "sabzora", "skorch-burgers", "forvello", "pastarivo", "nusara", "rise-and-griddle", "souvano"];
export const addonBrandIds = ["icova", "moktl"];

export const locations: MealDeckLocation[] = [
  { key: "luton", name: "MealDeck Luton", town: "Luton", hoursLabel: "5pm–11pm · Monday to Sunday", primaryBrandIds, addonBrandIds, allowedFulfilments: ["delivery", "pickup", "curbside"] },
  { key: "stalbans", name: "MealDeck St Albans", town: "St Albans", hoursLabel: "Mon–Fri · 09:00–16:00", primaryBrandIds: ["cafe1", ...primaryBrandIds], addonBrandIds, allowedFulfilments: ["delivery", "curbside", "pickup", "dinein"] },
];

export function brandById(id: string): Brand | undefined {
  return brands.find((brand) => brand.id === id);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function sampleLocationOpen(location: LocationKey, now = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    const minutes = hour * 60 + minute;
    if (location === "luton") return minutes >= 1020 && minutes < 1380; // 5pm–11pm, Monday to Sunday
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday) && minutes >= 540 && minutes < 960;
  } catch {
    return true;
  }
}

export function resolveSampleServiceability(
  postcode: string,
  fulfilment: FulfilmentType,
): { locationKey?: LocationKey; message: string; alternativeFulfilments?: FulfilmentType[] } {
  const normalized = postcode.toUpperCase().replace(/\s+/g, "");
  if (normalized.startsWith("LU")) {
    return { locationKey: "luton", message: "Great news — MealDeck Luton serves your area." };
  }
  if (normalized.startsWith("AL")) {
    return { locationKey: "stalbans", message: "Great news — MealDeck St Albans serves your area." };
  }
  const manchester =
    normalized.startsWith("M") || normalized.startsWith("OL") || normalized.startsWith("SK");
  return {
    message: manchester
      ? "Sorry, MealDeck is not in Manchester yet — we are coming soon."
      : "Sorry, MealDeck doesn't serve your area yet. We're expanding quickly — please check back soon.",
  };
}

function sampleOption(id: string, name: string, priceDeltaPence: number): ModifierOption {
  return { id, name, priceDeltaPence };
}

export function modifierOptionsFor(item: MenuItem): ModifierOption[] {
  if (item.brandId === "icova")
    return [
      sampleOption("sample-large", "Large", 100),
      sampleOption("sample-oat-milk", "Oat milk", 50),
      sampleOption("sample-extra-shot", "Extra shot", 60),
      sampleOption("sample-less-ice", "Less ice", 0),
    ];
  if (item.brandId === "moktl")
    return [
      sampleOption("sample-large", "Large", 100),
      sampleOption("sample-extra-fruit", "Extra fruit", 75),
      sampleOption("sample-less-ice", "Less ice", 0),
    ];
  if (item.brandId === "cafe1")
    return [
      sampleOption("sample-chips", "Add chips", 175),
      sampleOption("sample-beans", "Add beans", 125),
      sampleOption("sample-cheese", "Extra cheese", 100),
      sampleOption("sample-no-onions", "No onions", 0),
    ];
  return [
    sampleOption("sample-cheese", "Extra cheese", 100),
    sampleOption("sample-sauce", "Extra sauce", 50),
    sampleOption("sample-spicy", "Make it spicy", 0),
    sampleOption("sample-no-onions", "No onions", 0),
  ];
}

export function modifierGroupsFor(item: MenuItem): ModifierGroup[] {
  if (item.modifierGroups?.length) return item.modifierGroups;
  if (!item.hasModifiers) return [];
  return [
    {
      id: `sample-${item.id}`,
      name: "Choose your extras",
      minSelect: 0,
      maxSelect: 4,
      options: modifierOptionsFor(item),
    },
  ];
}

export function lineUnitPrice(line: Pick<CartLine, "pricePence" | "selectedModifiers">): number {
  return line.pricePence + line.selectedModifiers.reduce((sum, m) => sum + m.priceDeltaPence, 0);
}

export function addItem(lines: CartLine[], item: MenuItem, selectedModifiers: SelectedModifier[] = []): CartLine[] {
  const signature = selectedModifiers.map((m) => `${m.groupId}:${m.id}`).sort().join("|");
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
