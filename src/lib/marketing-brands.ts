import { approvedBrandLogos } from "@/lib/brand-logos";
import cafe1Logo from "@/assets/cafe1-logo.png";

export type MarketingBrand = {
  id: string;
  name: string;
  category: string;
  logo: string;
  rank: string;
  suit: "🍔" | "🌮" | "🍟" | "🥤";
};

/**
 * Marketing collection only.
 * Keep this independent from location/menu availability so the front-end brand
 * story can grow without coupling it to the ordering backend.
 */
export const marketingBrands: MarketingBrand[] = [
  { id: "taconelle", name: "Taconelle", category: "French tacos", logo: approvedBrandLogos.taconelle, rank: "A", suit: "🍔" },
  { id: "paratique", name: "Paratique", category: "Signature parathas", logo: approvedBrandLogos.paratique, rank: "K", suit: "🌮" },
  { id: "tavo-chicken", name: "Tavo Chicken", category: "All things chicken", logo: approvedBrandLogos["tavo-chicken"], rank: "Q", suit: "🍟" },
  { id: "loadd", name: "Load'd", category: "Loaded fries & mac n cheese", logo: approvedBrandLogos.loadd, rank: "J", suit: "🥤" },
  { id: "sabzora", name: "Sabzora", category: "Vegetarian Indian", logo: approvedBrandLogos.sabzora, rank: "10", suit: "🍔" },
  { id: "icova", name: "Icova", category: "Iced coffee, chai & desserts", logo: approvedBrandLogos.icova, rank: "9", suit: "🌮" },
  { id: "vyta", name: "Vyta", category: "Fresh juices", logo: approvedBrandLogos.vyta, rank: "8", suit: "🍟" },
  { id: "moktl", name: "Moktl", category: "Zero-alcohol mocktails", logo: approvedBrandLogos.moktl, rank: "7", suit: "🥤" },
  { id: "tarka-box", name: "Tarka Box", category: "Desi food", logo: approvedBrandLogos["tarka-box"], rank: "6", suit: "🍔" },
  { id: "skorch", name: "Skorch", category: "Smash burgers", logo: approvedBrandLogos.skorch, rank: "5", suit: "🌮" },
  { id: "pastarivo", name: "Pastarivo", category: "Fresh pasta", logo: approvedBrandLogos.pastarivo, rank: "4", suit: "🍟" },
  { id: "nusara", name: "Nusara", category: "South East Asian fusion", logo: approvedBrandLogos.nusara, rank: "3", suit: "🥤" },
  { id: "rise-and-griddle", name: "Rise & Griddle", category: "Breakfast & brunch", logo: approvedBrandLogos["rise-and-griddle"], rank: "2", suit: "🍔" },
  { id: "souvano", name: "Souvano", category: "Eastern Mediterranean grill", logo: approvedBrandLogos.souvano, rank: "A", suit: "🌮" },
  { id: "forvello", name: "Forvello", category: "Artisan Pizza", logo: approvedBrandLogos.forvello, rank: "F", suit: "🥤" },
];

/**
 * Café1 is location-exclusive (St Albans only), so it is kept out of the
 * shared homepage collection and appended only on the St Albans page.
 */
export const cafe1Brand: MarketingBrand = {
  id: "cafe1",
  name: "Café1",
  category: "Café Classics",
  logo: cafe1Logo,
  rank: "A",
  suit: "🥤",
};
