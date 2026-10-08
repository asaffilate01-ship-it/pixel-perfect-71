import taconelleImage from "@/assets/brand-taconelle.jpg";
import paratiqueImage from "@/assets/brand-paratique.jpg";
import tavoImage from "@/assets/brand-tavo.jpg";
import loaddImage from "@/assets/brand-loadd.jpg";
import sabzoraImage from "@/assets/brand-sabzora.jpg";
import icovaImage from "@/assets/brand-icova.jpg";
import vytaImage from "@/assets/brand-vyta.jpg";
import moktlImage from "@/assets/brand-moktl.jpg";
import tarkaImage from "@/assets/brand-tarka.jpg";
import skorchImage from "@/assets/brand-skorchd.jpg";
import pastarivoImage from "@/assets/brand-pastarivo.jpg";
import nusaraImage from "@/assets/brand-nusara.jpg";
import riseImage from "@/assets/brand-rise-griddle.jpg";
import souvanoImage from "@/assets/brand-souvano.jpg";
import forvelloImage from "@/assets/brand-forvello.jpg";
import { marketingBrands, type MarketingBrand } from "@/lib/marketing-brands";
import { FRANCHISE_BRAND_IDS, type FranchiseBrandId } from "@/lib/franchise-selection";

type FranchisePromotion = {
  image: string;
  collection: "food" | "drinks-desserts";
  tagline: string;
  pitch: string;
  existingKitchen: string;
  newEntrant: string;
};

export type FranchiseBrand = Omit<MarketingBrand, "id"> &
  FranchisePromotion & { id: FranchiseBrandId };

/** Recruitment content follows the marketing portfolio, never ordering availability. */
const promotions: Record<FranchiseBrandId, FranchisePromotion> = {
  taconelle: {
    image: taconelleImage,
    collection: "food",
    tagline: "Make French tacos your next venture.",
    pitch:
      "Build a business around French tacos, with Taconelle as your main brand or part of your MealDeck selection.",
    existingKitchen:
      "Discuss how French tacos would fit alongside your current menu and kitchen workflow.",
    newEntrant: "Explore the menu training and operating setup needed for a Taconelle launch.",
  },
  paratique: {
    image: paratiqueImage,
    collection: "food",
    tagline: "Give parathas centre stage.",
    pitch:
      "Make signature parathas the focus of your food business with Paratique, independently or within a chosen brand package.",
    existingKitchen:
      "Review how a dedicated paratha offer would fit your preparation space and existing service.",
    newEntrant:
      "Discuss the premises, training and daily operating requirements for a Paratique business.",
  },
  "tavo-chicken": {
    image: tavoImage,
    collection: "food",
    tagline: "Make chicken your speciality.",
    pitch:
      "Put chicken at the centre of your next food concept with Tavo Chicken, on its own or alongside complementary MealDeck brands.",
    existingKitchen:
      "Assess how Tavo Chicken would fit your current menu, team and available kitchen capacity.",
    newEntrant:
      "Plan the operating format and training requirements for a dedicated chicken business.",
  },
  loadd: {
    image: loaddImage,
    collection: "food",
    tagline: "Loaded fries. Mac ’n’ cheese. One brand.",
    pitch:
      "Give loaded fries and mac ’n’ cheese their own identity with Load’d, as a standalone concept or part of a wider brand selection.",
    existingKitchen:
      "Discuss how the Load’d menu would fit alongside the food you already prepare.",
    newEntrant:
      "Explore the setup and service plan for a business focused on loaded fries and mac ’n’ cheese.",
  },
  sabzora: {
    image: sabzoraImage,
    collection: "food",
    tagline: "Give vegetarian Indian food its own stage.",
    pitch:
      "Build a distinct vegetarian Indian offer with Sabzora, whether it becomes your main concept or joins your chosen MealDeck brands.",
    existingKitchen:
      "Review how a vegetarian Indian menu would fit your current preparation and food-handling arrangements.",
    newEntrant:
      "Discuss menu training, kitchen requirements and the proposed Sabzora operating package.",
  },
  icova: {
    image: icovaImage,
    collection: "drinks-desserts",
    tagline: "Coffee, chai and a sweet finish.",
    pitch:
      "Bring iced coffee, chai and desserts together under Icova, with the option to explore a focused concept or a complementary brand.",
    existingKitchen:
      "Assess how an Icova drinks-and-desserts offer would fit your current service and available space.",
    newEntrant:
      "Explore the premises format, preparation requirements and training for an Icova launch.",
  },
  vyta: {
    image: vytaImage,
    collection: "drinks-desserts",
    tagline: "Put fresh juices in the spotlight.",
    pitch:
      "Make fresh juices the focus of a Vyta business or explore their place within your selected MealDeck package.",
    existingKitchen:
      "Discuss preparation space and how a fresh-juice offer would fit your existing service.",
    newEntrant:
      "Plan the operating setup, product-handling requirements and training for a Vyta concept.",
  },
  moktl: {
    image: moktlImage,
    collection: "drinks-desserts",
    tagline: "Make mocktails your next move.",
    pitch:
      "Create a drinks offer around zero-alcohol mocktails with Moktl, independently or alongside your chosen food brands.",
    existingKitchen:
      "Review how mocktail preparation and service would fit your team and current operation.",
    newEntrant:
      "Explore the preparation setup, training and operating format for a Moktl business.",
  },
  "tarka-box": {
    image: tarkaImage,
    collection: "food",
    tagline: "Make Desi food your focus.",
    pitch:
      "Give Desi food a dedicated brand identity with Tarka Box, as your main franchise or part of a MealDeck combination.",
    existingKitchen:
      "Discuss how Tarka Box would complement your current menu and preparation workflow.",
    newEntrant:
      "Explore the menu training, kitchen requirements and launch plan for a Tarka Box operation.",
  },
  skorch: {
    image: skorchImage,
    collection: "food",
    tagline: "Make smash burgers your business.",
    pitch:
      "Build a focused smash burger business with Skorch, or add the brand to a compatible existing kitchen.",
    existingKitchen:
      "Assess how the Skorch menu would fit your current equipment, team and service capacity.",
    newEntrant:
      "Plan the premises, equipment assessment and practical training for your first Skorch operation.",
  },
  pastarivo: {
    image: pastarivoImage,
    collection: "food",
    tagline: "Put fresh pasta at the centre.",
    pitch:
      "Create a dedicated fresh-pasta offer with Pastarivo, as a single-brand franchise or within your own MealDeck selection.",
    existingKitchen:
      "Discuss how the pasta menu would fit your preparation process and current service.",
    newEntrant:
      "Explore the kitchen setup, menu training and daily operating requirements for Pastarivo.",
  },
  nusara: {
    image: nusaraImage,
    collection: "food",
    tagline: "Explore South East Asian fusion.",
    pitch:
      "Give South East Asian fusion its own place in your business with Nusara, independently or within an assessed brand combination.",
    existingKitchen:
      "Review the menu fit, preparation requirements and capacity of your existing kitchen.",
    newEntrant:
      "Discuss the training and service plan for a business focused on South East Asian fusion.",
  },
  "rise-and-griddle": {
    image: riseImage,
    collection: "food",
    tagline: "Make breakfast and brunch your business.",
    pitch:
      "Build a dedicated breakfast and brunch offer with Rise & Griddle, on its own or as part of your chosen MealDeck package.",
    existingKitchen:
      "Assess how breakfast and brunch would fit your opening hours, team and current menu.",
    newEntrant:
      "Plan the service hours, staffing and training requirements for a Rise & Griddle business.",
  },
  souvano: {
    image: souvanoImage,
    collection: "food",
    tagline: "Bring Eastern Mediterranean grill into focus.",
    pitch:
      "Create a distinct Eastern Mediterranean grill offer with Souvano, as your main concept or alongside other approved brands.",
    existingKitchen:
      "Discuss how the grill menu would fit your facilities, preparation workflow and operating capacity.",
    newEntrant:
      "Explore the premises requirements, training and operating plan for a Souvano launch.",
  },
  forvello: {
    image: forvelloImage,
    collection: "food",
    tagline: "Your next chapter in artisan pizza.",
    pitch:
      "Make artisan pizza the centre of a Forvello franchise, or explore its place within a compatible MealDeck brand package.",
    existingKitchen:
      "Assess how Forvello would fit your current facilities, menu and kitchen capacity.",
    newEntrant:
      "Discuss the operating format, equipment requirements and training for a Forvello business.",
  },
};

export const franchiseBrands: FranchiseBrand[] = FRANCHISE_BRAND_IDS.map((id) => {
  const brand = marketingBrands.find((entry) => entry.id === id);
  if (!brand) throw new Error(`Franchise brand ${id} is missing from the marketing portfolio.`);
  return { ...brand, ...promotions[id], id };
});

export function getFranchiseBrand(id: string): FranchiseBrand | undefined {
  return franchiseBrands.find((brand) => brand.id === id);
}
