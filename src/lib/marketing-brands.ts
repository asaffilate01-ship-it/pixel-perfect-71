import cafe1Logo from "@/assets/cafe1-logo.png";
import icova from "@/assets/premium-logos/icova-premium.png";
import loadd from "@/assets/premium-logos/loadd-premium.png";
import moktl from "@/assets/premium-logos/moktl-premium.png";
import nusara from "@/assets/premium-logos/nusara-premium.png";
import paratique from "@/assets/premium-logos/paratique-premium.png";
import pastarivo from "@/assets/premium-logos/pastarivo-premium.png";
import riseAndGriddle from "@/assets/premium-logos/rise-and-griddle-premium.png";
import sabzora from "@/assets/premium-logos/sabzora-premium.png";
import skorch from "@/assets/premium-logos/skorch-premium.png";
import souvano from "@/assets/premium-logos/souvano-premium.png";
import taconelle from "@/assets/premium-logos/taconelle-premium.png";
import tarkaBox from "@/assets/premium-logos/tarka-box-premium.png";
import tavoChicken from "@/assets/premium-logos/tavo-chicken-premium.png";
import vyta from "@/assets/premium-logos/vyta-premium.png";

export type MarketingBrand = {
  id: string;
  name: string;
  category: string;
  logo: string;
  rank: string;
  suit: "♥" | "♦" | "♠" | "♣";
};

/**
 * Marketing collection only.
 * Keep this independent from location/menu availability so the front-end brand
 * story can grow without coupling it to the ordering backend.
 */
export const marketingBrands: MarketingBrand[] = [
  { id: "taconelle", name: "Taconelle", category: "French tacos", logo: taconelle, rank: "A", suit: "♥" },
  { id: "paratique", name: "Paratique", category: "Signature parathas", logo: paratique, rank: "K", suit: "♦" },
  { id: "tavo-chicken", name: "Tavo Chicken", category: "All things chicken", logo: tavoChicken, rank: "Q", suit: "♠" },
  { id: "loadd", name: "Load'd", category: "Loaded fries & mac n cheese", logo: loadd, rank: "J", suit: "♣" },
  { id: "sabzora", name: "Sabzora", category: "Vegetarian Indian", logo: sabzora, rank: "10", suit: "♥" },
  { id: "icova", name: "Icova", category: "Iced coffee, chai & desserts", logo: icova, rank: "9", suit: "♦" },
  { id: "vyta", name: "Vyta", category: "Fresh juices", logo: vyta, rank: "8", suit: "♠" },
  { id: "moktl", name: "Moktl", category: "Zero-alcohol mocktails", logo: moktl, rank: "7", suit: "♣" },
  { id: "tarka-box", name: "Tarka Box", category: "Desi food", logo: tarkaBox, rank: "6", suit: "♥" },
  { id: "skorch", name: "Skorch", category: "Smash burgers", logo: skorch, rank: "5", suit: "♦" },
  { id: "pastarivo", name: "Pastarivo", category: "Fresh pasta", logo: pastarivo, rank: "4", suit: "♠" },
  { id: "nusara", name: "Nusara", category: "South East Asian fusion", logo: nusara, rank: "3", suit: "♣" },
  { id: "rise-and-griddle", name: "Rise & Griddle", category: "Breakfast & brunch", logo: riseAndGriddle, rank: "2", suit: "♥" },
  { id: "souvano", name: "Souvano", category: "Eastern Mediterranean grill", logo: souvano, rank: "A", suit: "♦" },
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
  suit: "♣",
};
