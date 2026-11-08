/**
 * Owner-reviewed menu content and integer-pence prices. The 5 November typed
 * menus supersede the earlier £20 placeholders for all five launch brands.
 * Live pricing and availability are database-owned.
 */

import type { MealDeckMilkcakePromotion } from "./mealdeck-milkcake-promotion";

export type LaunchMenuBrandId = "tavo-chicken" | "moktl" | "loadd" | "skorch-burgers" | "souvano";

export type LaunchMenuOption = {
  id: string;
  label: string;
  description?: string;
  pricePence: number | null;
  available?: boolean;
  unavailableReason?: string;
  sourceRefs: string[];
};

export type LaunchMenuOptionGroup = {
  id: string;
  label: string;
  description?: string;
  kind: "single" | "multiple";
  required: boolean;
  when?: { groupId: string; optionIds: string[] };
  /** An upgrade replaces this included component instead of adding a second one. */
  replacedBy?: { crossSlot: "drink"; optionIds: string[] };
  options: LaunchMenuOption[];
  sourceRefs: string[];
};

export type LaunchMenuPriceVariant = {
  groupId: string;
  optionId: string;
  label: string;
  selections: Record<string, string>;
  /** Full dish price, including this exact flavour and portion. */
  pricePence: number;
  available?: boolean;
};

export type LaunchMenuItem = {
  id: string;
  name: string;
  description?: string;
  pricePence: number | null;
  /** Current public catalogue state; source templates leave these unset. */
  available?: boolean;
  /** Validated live server metadata only; source templates cannot activate an offer. */
  promotion?: MealDeckMilkcakePromotion;
  replacementPricePence?: number | null;
  replacementLabel?: string;
  availableOptionIds?: string[];
  optionGroupIds: string[];
  priceVariants?: LaunchMenuPriceVariant[];
  sourceRefs: string[];
};

export type LaunchMenuSection = {
  id: string;
  title: string;
  description?: string;
  items: LaunchMenuItem[];
  sourceRefs: string[];
};

export type LaunchMenuUpsell = {
  id: string;
  label: string;
  description?: string;
  optionGroupId?: string;
  targetBrandId?: LaunchMenuBrandId;
  targetSectionId?: string;
  sourceRefs: string[];
};

export type LaunchMenuBrand = {
  id: LaunchMenuBrandId;
  name: string;
  accent: string;
  description?: string;
  sections: LaunchMenuSection[];
  optionGroups: LaunchMenuOptionGroup[];
  upsells: LaunchMenuUpsell[];
  sourceRefs: string[];
};

export type LaunchMenuSource = {
  id: string;
  originalFileName: string;
  width: number;
  height: number;
  regions: {
    id: string;
    label: string;
    pageLabel?: string;
    /** Source-image coordinates, x/y/width/height, for editorial verification. */
    bounds: [number, number, number, number];
  }[];
};

export const launchMenuSources: LaunchMenuSource[] = [
  {
    id: "souvano-menu",
    originalFileName: "01-1000360481.jpg",
    width: 1536,
    height: 1024,
    regions: [
      {
        id: "stir-fry-donner",
        label: "Stir Fry Donner and meal offer",
        bounds: [26, 251, 505, 475],
      },
      { id: "heatwave", label: "Heatwave and meal offer", bounds: [543, 251, 462, 475] },
      { id: "lamb-chops", label: "Lamb Chops and meal offer", bounds: [1018, 251, 493, 475] },
      { id: "cans-drinks", label: "Cans & Drinks", bounds: [82, 753, 1372, 159] },
    ],
  },
  {
    id: "loadd-menu",
    originalFileName: "02-1000360479.jpg",
    width: 1536,
    height: 1024,
    regions: [
      { id: "loaded-fries", label: "Loaded Fries", bounds: [25, 258, 451, 527] },
      { id: "loaded-mac-cheese", label: "Loaded Mac ’n Cheese", bounds: [486, 258, 495, 527] },
      { id: "full-house", label: "The Full House", bounds: [990, 258, 524, 527] },
      { id: "cans-drinks", label: "Cans & Drinks", bounds: [64, 804, 1408, 129] },
    ],
  },
  {
    id: "moktl-menu",
    originalFileName: "03-1000360478.jpg",
    width: 1152,
    height: 1536,
    regions: [
      { id: "mocktail-lounge", label: "Mocktail Lounge", bounds: [37, 302, 1076, 824] },
      { id: "rush-hour", label: "Rush Hour", bounds: [72, 1135, 1011, 169] },
    ],
  },
  {
    id: "skorch-menu",
    originalFileName: "04-1000360477.jpg",
    width: 1152,
    height: 1536,
    regions: [
      { id: "beef-smash-deck", label: "The Beef Smash Deck", bounds: [35, 291, 624, 500] },
      { id: "burger-add-ons", label: "Burger Add-ons", bounds: [66, 802, 554, 98] },
      { id: "make-it-a-meal", label: "Make It a Meal", bounds: [711, 337, 383, 105] },
      { id: "meal-upgrades", label: "Meal Upgrades", bounds: [712, 456, 381, 261] },
      { id: "kids-meal", label: "Kids Meal", bounds: [711, 756, 382, 126] },
      { id: "sides", label: "Sides", bounds: [35, 936, 528, 417] },
      { id: "cans-drinks", label: "Cans & Drinks", bounds: [579, 936, 539, 417] },
    ],
  },
  {
    id: "tavo-menu",
    originalFileName: "05-1000360462.jpg",
    width: 1536,
    height: 1024,
    regions: [
      {
        id: "burgers",
        label: "Burgers and meal offer",
        pageLabel: "TAVO / 01",
        bounds: [10, 196, 409, 473],
      },
      {
        id: "dipped-burger",
        label: "Upgrade to a Dipped Burger",
        pageLabel: "TAVO / 01",
        bounds: [431, 183, 322, 280],
      },
      {
        id: "burger-add-ons",
        label: "Burger Add Ons",
        pageLabel: "TAVO / 01",
        bounds: [431, 463, 322, 205],
      },
      {
        id: "meal-upgrades-page-1",
        label: "Meal Upgrades",
        pageLabel: "TAVO / 01",
        bounds: [10, 686, 743, 238],
      },
      {
        id: "fried-chicken-wings",
        label: "Fried Chicken Wings",
        pageLabel: "TAVO / 02",
        bounds: [780, 190, 745, 152],
      },
      {
        id: "fried-chicken-tenders",
        label: "Fried Chicken Tenders",
        pageLabel: "TAVO / 02",
        bounds: [780, 350, 745, 151],
      },
      {
        id: "grilled-chicken-wings",
        label: "Grilled Chicken Wings",
        pageLabel: "TAVO / 02",
        bounds: [780, 508, 745, 150],
      },
      {
        id: "kids-meals",
        label: "Kids Meals",
        pageLabel: "TAVO / 02",
        bounds: [781, 666, 257, 106],
      },
      {
        id: "meal-upgrades-page-2",
        label: "Meal Upgrades",
        pageLabel: "TAVO / 02",
        bounds: [781, 776, 257, 147],
      },
      { id: "sides", label: "Sides", pageLabel: "TAVO / 02", bounds: [1046, 666, 234, 257] },
      {
        id: "cans-drinks",
        label: "Cans & Drinks",
        pageLabel: "TAVO / 02",
        bounds: [1285, 666, 240, 257],
      },
    ],
  },
];

type MenuRow = readonly [
  name: string,
  pricePence: number | null,
  description?: string | undefined,
  /** Preserve a known item ID when its display name is revised. */
  stableSlug?: string,
];

/** The owner's typed menu replaces the earlier blanket £20 placeholders. */
export const LAUNCH_MENU_PRICE_REVISION = "owner-menu-20261105-v2";
export const launchMenuPriceApproval = {
  id: LAUNCH_MENU_PRICE_REVISION,
  approvedOn: "2026-11-05",
  description: "Owner-supplied typed Skorch, Load’d, Moktl, Tavo and Souvano menus and prices.",
  brandIds: ["skorch-burgers", "loadd", "moktl", "tavo-chicken", "souvano"] as const,
};
/** Additive owner instruction; the existing menu price revision remains intact. */
export const launchMenuDessertApproval = {
  id: "owner-desserts-20261106",
  approvedOn: "2026-11-06",
  description: "Biscoff and Oreo milkcakes, £3.99 each, on every menu with dessert upsells.",
  brandIds: launchMenuPriceApproval.brandIds,
} as const;
export const LAUNCH_MEAL_PRICE_PENCE = 250;
export const LAUNCH_SIDE_UPGRADE_PRICE_PENCE = {
  "loaded-fries": 299,
  "loaded-mac-cheese": 399,
} as const;
export const LAUNCH_MOCKTAIL_UPGRADE_PRICE_PENCE = 299;

export function launchCrossReplacementPricePence(targetSectionId: string): number | null {
  if (targetSectionId === "mocktail-lounge") return LAUNCH_MOCKTAIL_UPGRADE_PRICE_PENCE;
  if (targetSectionId === "loaded-fries" || targetSectionId === "loaded-mac-cheese")
    return LAUNCH_SIDE_UPGRADE_PRICE_PENCE[targetSectionId];
  return null;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function reviewedRefs(brandId: LaunchMenuBrandId, refs: string[]) {
  return [...new Set([...refs, `${LAUNCH_MENU_PRICE_REVISION}#${brandId}`])];
}

function section(
  brandId: LaunchMenuBrandId,
  id: string,
  title: string,
  rows: readonly MenuRow[],
  sourceRefs: string[],
  description?: string,
  optionGroupIds: string[] = [],
): LaunchMenuSection {
  const refs = reviewedRefs(brandId, sourceRefs);
  return {
    id,
    title,
    ...(description ? { description } : {}),
    sourceRefs: refs,
    items: rows.map(([name, pricePence, itemDescription, stableSlug]) => ({
      id: brandId + "-" + id + "-" + (stableSlug ?? slug(name)),
      name,
      ...(itemDescription ? { description: itemDescription } : {}),
      pricePence,
      optionGroupIds: [...optionGroupIds],
      sourceRefs: refs,
    })),
  };
}

function group(
  id: string,
  label: string,
  kind: LaunchMenuOptionGroup["kind"],
  required: boolean,
  rows: readonly MenuRow[],
  sourceRefs: string[],
  description?: string,
  when?: LaunchMenuOptionGroup["when"],
): LaunchMenuOptionGroup {
  return {
    id,
    label,
    kind,
    required,
    ...(when ? { when } : {}),
    ...(description ? { description } : {}),
    sourceRefs: [...sourceRefs],
    options: rows.map(([optionLabel, pricePence, optionDescription, stableSlug]) => ({
      id: id + "-" + (stableSlug ?? slug(optionLabel)),
      label: optionLabel,
      ...(optionDescription ? { description: optionDescription } : {}),
      pricePence,
      ...(/^milkshake/i.test(optionLabel)
        ? { available: false, unavailableReason: "Flavours coming soon" }
        : {}),
      sourceRefs: [...sourceRefs],
    })),
  };
}

const tavoDrinks: readonly MenuRow[] = [
  ["Coke", 100],
  ["Pepsi Max", 100],
  ["Tango Apple", 100],
  ["Miranda Orange", 100],
  ["Miranda Strawberry", 100],
  ["Barr Limeade", 100],
  ["Water Bottle", 100],
  ["Red Bull", 220],
];
const skorchLoaddDrinks: readonly MenuRow[] = [
  ["Coke", 100],
  ["Pepsi", 100],
  ["Pepsi Max", 100],
  ["Tango Orange", 100],
  ["Tango Apple", 100],
  ["Rubicon Mango", 100],
  ["7up", 100],
  ["Water Bottle", 100],
  ["Red Bull", 220],
];
const sharedSides: readonly MenuRow[] = [
  ["Fries", 200],
  ["Peri Fries", 250],
  ["Onion Rings (x6)", 250],
  ["Mozzarella Sticks (x6)", 300],
  ["Chilli Cheese Nuggets (x6)", 300],
  ["Chicken Nuggets (x6)", 400],
];
const tavoSides: readonly MenuRow[] = sharedSides.map((row) =>
  row[0] === "Chicken Nuggets (x6)" ? [row[0], 350] : row,
);
const tavoChickenRefs = [
  "tavo-menu#fried-chicken-wings",
  "tavo-menu#fried-chicken-tenders",
  "tavo-menu#grilled-chicken-wings",
  `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`,
];
const tavoMealUpgradeRefs = [
  "tavo-menu#meal-upgrades-page-1",
  "tavo-menu#meal-upgrades-page-2",
  `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`,
];
const tavoMealUpgradeRows: readonly MenuRow[] = [
  ["Peri Salt", 50],
  ["Loaded Fries Upgrade", 299],
  ["Loaded Mac ’n Cheese Upgrade", 399],
  ["Mocktail Upgrade", 299],
  ["Milkshake Upgrade", 299],
];
const skorchMealUpgradeRows: readonly MenuRow[] = [
  ["Peri Salt", 50],
  ["Loaded Fries", 299],
  ["Loaded Mac ’n’ Cheese", 399],
  ["Mocktail", 299],
  ["Milkshake", 299],
];
const tavoBurgerGroupIds = [
  "tavo-chicken-dipped-burger",
  "tavo-chicken-burger-add-ons",
  "tavo-chicken-make-it-a-meal",
  "tavo-chicken-meal-upgrades",
];
const tavoChickenGroupIds = [
  "tavo-chicken-portion",
  "tavo-chicken-flavour",
  "tavo-chicken-make-it-a-meal",
  "tavo-chicken-meal-upgrades",
];
const tavoGrilledGroupIds = tavoChickenGroupIds.map((id) =>
  id === "tavo-chicken-flavour" ? "tavo-grilled-chicken-flavour" : id,
);

/** Full prices: flavour and portion interact, so neither is a flat surcharge. */
const tavoFriedPriceMatrix = [
  ["Plain Flavour", [299, 550, 649]],
  ["Korean BBQ", [350, 650, 799]],
  ["Dynamite", [350, 650, 799]],
  ["Fiery Sweet Chilli", [350, 650, 899]],
] as const;
const tavoGrilledPriceMatrix = [
  ["Plain Flavour", [249, 449, 649]],
  ["Spicy Honey BBQ", [299, 499, 699]],
  ["Dynamite", [299, 499, 699]],
  ["Fiery Sweet Chilli", [299, 499, 699]],
] as const;

function chickenSection(id: string, title: string, grilled = false): LaunchMenuSection {
  const rows = grilled ? tavoGrilledPriceMatrix : tavoFriedPriceMatrix;
  const flavourGroup = grilled ? "tavo-grilled-chicken-flavour" : "tavo-chicken-flavour";
  const result = section(
    "tavo-chicken",
    id,
    title,
    [[title, grilled ? 249 : 299]],
    [`tavo-menu#${id}`],
    "Choose your portion and flavour.",
    grilled ? tavoGrilledGroupIds : tavoChickenGroupIds,
  );
  const item = result.items[0]!;
  item.priceVariants = rows.flatMap(([flavour, prices]) =>
    prices.map((pricePence, index) => {
      const portion = [3, 5, 8][index];
      const groupId = `${item.id}-price-variant`;
      return {
        groupId,
        optionId: `${groupId}-${slug(flavour)}-${portion}-pcs`,
        label: `${flavour} · ${portion} pcs`,
        selections: {
          "tavo-chicken-portion": `tavo-chicken-portion-${portion}-pcs`,
          [flavourGroup]: `${flavourGroup}-${slug(flavour)}`,
        },
        pricePence,
      };
    }),
  );
  return result;
}

const tavo: LaunchMenuBrand = {
  id: "tavo-chicken",
  name: "Tavo Chicken",
  accent: "#D7141A",
  description: "Chicken burgers, wings & more.",
  sourceRefs: ["tavo-menu", `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`],
  sections: [
    section(
      "tavo-chicken",
      "burgers",
      "Burgers",
      [
        ["Cruncher", 449, "Buttermilk fried chicken fillet"],
        ["Twin Crunch", 599, "2 buttermilk fried chicken fillets"],
        ["Flame", 550, "Spicy grilled chicken fillet"],
        ["Big Flame", 650, "2 spicy grilled chicken fillets"],
      ],
      ["tavo-menu#burgers"],
      "All burgers with lettuce, cheese, gherkin & Algerian sauce.",
      tavoBurgerGroupIds,
    ),
    chickenSection("fried-chicken-wings", "Fried Chicken Wings"),
    chickenSection("fried-chicken-tenders", "Fried Chicken Tenders"),
    chickenSection("grilled-chicken-wings", "Grilled Chicken Wings", true),
    section(
      "tavo-chicken",
      "kids-meals",
      "Kids Meals",
      [["Nuggets Meal", 500, "6 nuggets, fries & drink.", "little-jacks-nugget-meal"]],
      ["tavo-menu#kids-meals"],
      undefined,
      ["tavo-chicken-kids-meal-upgrades"],
    ),
    section("tavo-chicken", "sides", "Sides", tavoSides, ["tavo-menu#sides"]),
    section("tavo-chicken", "cans-drinks", "Cans & Drinks", tavoDrinks, ["tavo-menu#cans-drinks"]),
  ],
  optionGroups: [
    group(
      "tavo-chicken-portion",
      "Portion",
      "single",
      true,
      [
        ["3 pcs", 0],
        ["5 pcs", 0],
        ["8 pcs", 0],
      ],
      tavoChickenRefs,
      "Your dish price updates for the selected portion and flavour.",
    ),
    group(
      "tavo-chicken-flavour",
      "Flavour",
      "single",
      true,
      [
        ["Plain Flavour", 0],
        ["Korean BBQ", 0],
        ["Dynamite", 0],
        ["Fiery Sweet Chilli", 0],
      ],
      tavoChickenRefs,
      "Your dish price includes the selected flavour.",
    ),
    group(
      "tavo-grilled-chicken-flavour",
      "Flavour",
      "single",
      true,
      [
        ["Plain Flavour", 0],
        ["Spicy Honey BBQ", 0],
        ["Dynamite", 0],
        ["Fiery Sweet Chilli", 0],
      ],
      ["tavo-menu#grilled-chicken-wings", `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`],
      "Your dish price includes the selected flavour.",
    ),
    group(
      "tavo-chicken-dipped-burger",
      "Dip Your Burger",
      "single",
      false,
      [
        ["Korean BBQ", 150],
        ["Dynamite", 150],
        ["Fiery Sweet Chilli", 150],
      ],
      ["tavo-menu#dipped-burger", `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`],
      "Dip your burger for £1.50. Choose one flavour; the dip is charged once.",
    ),
    group(
      "tavo-chicken-burger-add-ons",
      "Burger Add Ons",
      "multiple",
      false,
      [
        ["2 Rashers", 150],
        ["Onion Rings", 150],
        ["Cheese Slice", 50],
      ],
      ["tavo-menu#burger-add-ons", `${LAUNCH_MENU_PRICE_REVISION}#tavo-chicken`],
    ),
    group(
      "tavo-chicken-make-it-a-meal",
      "Make It a Meal",
      "single",
      false,
      [["Make it a meal", LAUNCH_MEAL_PRICE_PENCE, "Fries and drink."]],
      ["tavo-menu#burgers", ...tavoChickenRefs],
    ),
    group(
      "tavo-chicken-meal-upgrades",
      "Meal Upgrades",
      "multiple",
      false,
      tavoMealUpgradeRows,
      tavoMealUpgradeRefs,
      undefined,
      {
        groupId: "tavo-chicken-make-it-a-meal",
        optionIds: ["tavo-chicken-make-it-a-meal-make-it-a-meal"],
      },
    ),
    group(
      "tavo-chicken-kids-meal-upgrades",
      "Meal Upgrades",
      "multiple",
      false,
      tavoMealUpgradeRows,
      tavoMealUpgradeRefs,
    ),
  ],
  upsells: [
    {
      id: "tavo-chicken-upsell-meal",
      label: "Make It a Meal",
      description: "Fries and drink.",
      optionGroupId: "tavo-chicken-make-it-a-meal",
      sourceRefs: ["tavo-menu#burgers", ...tavoChickenRefs],
    },
    {
      id: "tavo-chicken-upsell-dipped-burger",
      label: "Dip Your Burger",
      description: "Choose Korean BBQ, Fiery Sweet Chilli or Dynamite.",
      optionGroupId: "tavo-chicken-dipped-burger",
      sourceRefs: ["tavo-menu#dipped-burger"],
    },
    {
      id: "tavo-chicken-upsell-add-ons",
      label: "Burger Add Ons",
      optionGroupId: "tavo-chicken-burger-add-ons",
      sourceRefs: ["tavo-menu#burger-add-ons"],
    },
    {
      id: "tavo-chicken-upsell-upgrades",
      label: "Meal Upgrades",
      optionGroupId: "tavo-chicken-meal-upgrades",
      sourceRefs: tavoMealUpgradeRefs,
    },
    {
      id: "tavo-chicken-upsell-drinks",
      label: "Cans & Drinks",
      targetBrandId: "tavo-chicken",
      targetSectionId: "cans-drinks",
      sourceRefs: ["tavo-menu#cans-drinks"],
    },
  ],
};

const moktl: LaunchMenuBrand = {
  id: "moktl",
  name: "Moktl",
  accent: "#AD7C12",
  description: "Premium mocktails. Zero alcohol. Full vibe.",
  sourceRefs: ["moktl-menu", `${LAUNCH_MENU_PRICE_REVISION}#moktl`],
  sections: [
    section(
      "moktl",
      "mocktail-lounge",
      "Mocktail Lounge",
      [
        ["Virgin Mojito", 450],
        ["Mango Mirage", 450],
        ["Lychee Breeze", 450],
        ["Apple Rush", 450],
        ["Blue Wave", 450],
        ["Strawberry Splash", 450],
        ["Passion Paradise", 450],
        ["Rush Hour", 600, "Energy drink flavour"],
      ],
      ["moktl-menu#mocktail-lounge", "moktl-menu#rush-hour"],
    ),
  ],
  optionGroups: [],
  upsells: [
    {
      id: "moktl-featured-rush-hour",
      label: "Rush Hour",
      description: "Energy drink flavour",
      targetBrandId: "moktl",
      targetSectionId: "mocktail-lounge",
      sourceRefs: ["moktl-menu#rush-hour"],
    },
  ],
};

const loadd: LaunchMenuBrand = {
  id: "loadd",
  name: "Load’d",
  accent: "#A66E00",
  description: "Loaded fries • Mac n cheese. Fries, taken further.",
  sourceRefs: ["loadd-menu", `${LAUNCH_MENU_PRICE_REVISION}#loadd`],
  sections: [
    section(
      "loadd",
      "loaded-fries",
      "Loaded Fries",
      [
        ["Royal Flush", 550, "Fried chicken", "king-of-hearts"],
        ["Double Deck", 550, "Grilled chicken", "queen-of-hearts"],
        ["All In", 550, "Chicken shawarma", "jack-of-diamonds"],
        ["The Jackpot", 550, "Smash beef", "king-of-spades"],
      ],
      ["loadd-menu#loaded-fries"],
      "All with cheese, Algerian sauce, and spring onions.",
    ),
    section(
      "loadd",
      "loaded-mac-cheese",
      "Loaded Mac ’n Cheese",
      [
        ["Ace Mac", 500, "Plain mac & cheese."],
        ["Jack’s Mac", 599, "Fried chicken, Algerian sauce & crispy fried onions."],
        ["Diamond Melt", 599, "Chicken shawarma, Algerian sauce & crispy fried onions."],
        ["Spade Stack", 599, "Smash beef, Algerian sauce & crispy fried onions."],
        ["King’s Mac", 599, "Grilled chicken, Algerian sauce & crispy fried onions."],
      ],
      ["loadd-menu#loaded-mac-cheese"],
    ),
    section(
      "loadd",
      "full-house",
      "The Full House",
      [
        ["Royal Flush", 699, "Fried chicken, loaded fries and mac ’n cheese.", "king-of-hearts"],
        ["Double Deck", 699, "Grilled chicken, loaded fries and mac ’n cheese.", "queen-of-hearts"],
        ["All In", 699, "Chicken shawarma, loaded fries and mac ’n cheese.", "jack-of-diamonds"],
        ["The Jackpot", 699, "Smashed beef, loaded fries and mac ’n cheese.", "king-of-spades"],
      ],
      ["loadd-menu#full-house"],
      "The best of both worlds. Loaded fries and mac ’n cheese together in one box, topped with cheese, Algerian sauce, spring onions and crispy fried onions.",
    ),
    section("loadd", "sides", "Sides", sharedSides, [`${LAUNCH_MENU_PRICE_REVISION}#loadd`]),
    section("loadd", "cans-drinks", "Cans & Drinks", skorchLoaddDrinks, ["loadd-menu#cans-drinks"]),
  ],
  optionGroups: [],
  upsells: [
    {
      id: "loadd-upsell-full-house",
      label: "The Full House",
      description: "Loaded fries and mac ’n cheese together in one box.",
      targetBrandId: "loadd",
      targetSectionId: "full-house",
      sourceRefs: ["loadd-menu#full-house"],
    },
    {
      id: "loadd-upsell-drinks",
      label: "Cans & Drinks",
      targetBrandId: "loadd",
      targetSectionId: "cans-drinks",
      sourceRefs: ["loadd-menu#cans-drinks"],
    },
  ],
};

const skorch: LaunchMenuBrand = {
  id: "skorch-burgers",
  name: "Skorch",
  accent: "#D94900",
  description: "Smash burgers. Seared on steel.",
  sourceRefs: ["skorch-menu", `${LAUNCH_MENU_PRICE_REVISION}#skorch-burgers`],
  sections: [
    section(
      "skorch-burgers",
      "beef-smash-deck",
      "The Beef Smash Deck",
      [
        ["The Ace", 399, "Single beef smash – 1 patty."],
        ["Double Deal", 550, "Double beef smash – 2 patties."],
        ["Triple Stack", 700, "Triple beef smash – 3 patties."],
        ["Four of a Kind", 899, "Quadruple beef smash – 4 patties."],
      ],
      ["skorch-menu#beef-smash-deck"],
      "All with lettuce, cheese, gherkin, caramelised onion & Algerian sauce.",
      [
        "skorch-burgers-burger-add-ons",
        "skorch-burgers-make-it-a-meal",
        "skorch-burgers-meal-upgrades",
      ],
    ),
    section(
      "skorch-burgers",
      "kids-meal",
      "Kids Meal",
      [["Nuggets Meal", 500, "6 nuggets, fries & drink.", "little-jacks-nuggets-meal"]],
      ["skorch-menu#kids-meal"],
      undefined,
      ["skorch-burgers-kids-meal-upgrades"],
    ),
    section("skorch-burgers", "sides", "Sides", sharedSides, ["skorch-menu#sides"]),
    section("skorch-burgers", "cans-drinks", "Cans & Drinks", skorchLoaddDrinks, [
      "skorch-menu#cans-drinks",
    ]),
  ],
  optionGroups: [
    group(
      "skorch-burgers-burger-add-ons",
      "Burger Add-ons",
      "multiple",
      false,
      [
        ["2 Rashers", 199],
        ["3 Onion Rings", 199],
        ["Cheese Slice", 50],
      ],
      ["skorch-menu#burger-add-ons", `${LAUNCH_MENU_PRICE_REVISION}#skorch-burgers`],
    ),
    group(
      "skorch-burgers-make-it-a-meal",
      "Make It a Meal",
      "single",
      false,
      [["Make it a meal", LAUNCH_MEAL_PRICE_PENCE, "Fries and drink."]],
      ["skorch-menu#make-it-a-meal", `${LAUNCH_MENU_PRICE_REVISION}#skorch-burgers`],
    ),
    group(
      "skorch-burgers-meal-upgrades",
      "Meal Upgrades",
      "multiple",
      false,
      skorchMealUpgradeRows,
      ["skorch-menu#meal-upgrades", `${LAUNCH_MENU_PRICE_REVISION}#skorch-burgers`],
      undefined,
      {
        groupId: "skorch-burgers-make-it-a-meal",
        optionIds: ["skorch-burgers-make-it-a-meal-make-it-a-meal"],
      },
    ),
    group(
      "skorch-burgers-kids-meal-upgrades",
      "Meal Upgrades",
      "multiple",
      false,
      skorchMealUpgradeRows,
      ["skorch-menu#meal-upgrades", `${LAUNCH_MENU_PRICE_REVISION}#skorch-burgers`],
    ),
  ],
  upsells: [
    {
      id: "skorch-burgers-upsell-meal",
      label: "Make It a Meal",
      description: "Fries and drink.",
      optionGroupId: "skorch-burgers-make-it-a-meal",
      sourceRefs: ["skorch-menu#make-it-a-meal"],
    },
    {
      id: "skorch-burgers-upsell-add-ons",
      label: "Burger Add-ons",
      optionGroupId: "skorch-burgers-burger-add-ons",
      sourceRefs: ["skorch-menu#burger-add-ons"],
    },
    {
      id: "skorch-burgers-upsell-upgrades",
      label: "Meal Upgrades",
      optionGroupId: "skorch-burgers-meal-upgrades",
      sourceRefs: ["skorch-menu#meal-upgrades"],
    },
    {
      id: "skorch-burgers-upsell-drinks",
      label: "Cans & Drinks",
      targetBrandId: "skorch-burgers",
      targetSectionId: "cans-drinks",
      sourceRefs: ["skorch-menu#cans-drinks"],
    },
  ],
};

const souvanoRefs = [`${LAUNCH_MENU_PRICE_REVISION}#souvano`];
const souvano: LaunchMenuBrand = {
  id: "souvano",
  name: "Souvano",
  accent: "#C85600",
  description: "Mediterranean grill. Your choice of fries, rice or naan included.",
  sourceRefs: ["souvano-menu", ...souvanoRefs],
  sections: [
    section(
      "souvano",
      "stir-fry-donner",
      "Stir-Fry Doner",
      [["Stir-Fry Doner", 650, undefined, "stir-fry-donner"]],
      ["souvano-menu#stir-fry-donner"],
      "Choose Plain, Fiery Sweet Chilli, Dynamite or Korean BBQ, with fries, rice or naan included.",
      ["souvano-donner-flavour", "souvano-meal-side"],
    ),
    section(
      "souvano",
      "heatwave",
      "Heatwave",
      [["Heatwave", 699, "Spicy Middle Eastern Chicken. Chopped & shredded chicken."]],
      ["souvano-menu#heatwave"],
      "Your choice of fries, rice or naan included.",
      ["souvano-heatwave-base"],
    ),
    section(
      "souvano",
      "lamb-chops",
      "Lamb Chops",
      [["Lamb Chops", 999, "Tender, flavourful lamb chops."]],
      ["souvano-menu#lamb-chops"],
      "Middle Eastern flavour. Your choice of fries, rice or naan included.",
      ["souvano-meal-side"],
    ),
  ],
  optionGroups: [
    group(
      "souvano-donner-flavour",
      "Flavour",
      "single",
      true,
      [
        ["Plain", 0],
        ["Fiery Sweet Chilli", 0],
        ["Dynamite", 0],
        ["Korean BBQ", 0],
      ],
      ["souvano-menu#stir-fry-donner", ...souvanoRefs],
    ),
    group(
      "souvano-heatwave-base",
      "Included side",
      "single",
      true,
      [
        ["Fries", 0],
        ["Rice", 0, undefined, "fragrant-spicy-rice"],
        ["Naan", 0],
      ],
      ["souvano-menu#heatwave", ...souvanoRefs],
    ),
    group(
      "souvano-meal-side",
      "Included side",
      "single",
      true,
      [
        ["Fries", 0],
        ["Rice", 0],
        ["Naan", 0],
      ],
      souvanoRefs,
    ),
  ],
  upsells: [],
};

function addIncludedMealDrinks(brand: LaunchMenuBrand, drinks: readonly MenuRow[]) {
  const mealGroupId = `${brand.id}-make-it-a-meal`;
  const mainId = `${brand.id}-included-meal-drink`;
  const kidsId = `${brand.id}-kids-included-drink`;
  const refs = [`${LAUNCH_MENU_PRICE_REVISION}#${brand.id}`];
  const rows: MenuRow[] = drinks.filter((row) => row[1] === 100).map(([name]) => [name, 0]);
  const main = group(
    mainId,
    "Included meal drink",
    "single",
    true,
    rows,
    refs,
    "Choose a standard can or water, included with your meal.",
    { groupId: mealGroupId, optionIds: [`${mealGroupId}-make-it-a-meal`] },
  );
  const kids = group(
    kidsId,
    "Included meal drink",
    "single",
    true,
    rows,
    refs,
    "Choose a standard can or water, included with your meal.",
  );
  for (const entry of [main, kids]) {
    const upgradeId =
      entry.id === mainId ? `${brand.id}-meal-upgrades` : `${brand.id}-kids-meal-upgrades`;
    const upgrade = brand.optionGroups.find((candidate) => candidate.id === upgradeId)!;
    entry.replacedBy = {
      crossSlot: "drink",
      optionIds: upgrade.options
        .filter((option) => /mocktail|milkshake/i.test(option.label))
        .map((option) => option.id),
    };
    brand.optionGroups.push(entry);
  }
  for (const section of brand.sections) {
    for (const item of section.items) {
      if (item.optionGroupIds.includes(mealGroupId)) item.optionGroupIds.push(mainId);
      else if (section.id.startsWith("kids-")) item.optionGroupIds.push(kidsId);
    }
  }
}
addIncludedMealDrinks(tavo, tavoDrinks);
addIncludedMealDrinks(skorch, skorchLoaddDrinks);

/** Five owner-priced menus; portion/flavour variants remain selectable choices. */
export const launchMenuBrands: LaunchMenuBrand[] = [tavo, moktl, loadd, skorch, souvano];

// Standalone products keep flavour, quantity and bag assignment explicit through
// checkout, the shared kitchen ticket and receipts. They are never meal replacements.
for (const brand of launchMenuBrands) {
  const sourceRefs = [`${launchMenuDessertApproval.id}#${brand.id}`];
  brand.sections.push({
    id: "desserts",
    title: "Desserts",
    sourceRefs,
    items: [
      { id: `${brand.id}-desserts-biscoff-milkcake`, name: "Biscoff Milkcake" },
      { id: `${brand.id}-desserts-oreo-milkcake`, name: "Oreo Milkcake" },
    ].map((item) => ({ ...item, pricePence: 399, optionGroupIds: [], sourceRefs })),
  });
}

export function getLaunchMenuBrand(
  id: string,
  catalogue = launchMenuBrands,
): LaunchMenuBrand | undefined {
  const canonicalId = id === "skorch" ? "skorch-burgers" : id;
  return catalogue.find((brand) => brand.id === canonicalId);
}

/** Price approval is not proof of opening hours, stock, payment or availability. */
export function isLaunchBrandPriceApproved(id: string): boolean {
  const brand = getLaunchMenuBrand(id);
  return !!brand && launchMenuPriceApproval.brandIds.some((approved) => approved === brand.id);
}

/** Derive the single hidden canonical variant option from explicit source choices. */
export function getLaunchMenuPriceVariant(
  brandId: string,
  itemId: string,
  selections: Record<string, string[]>,
  catalogue = launchMenuBrands,
): LaunchMenuPriceVariant | undefined {
  const item = getLaunchMenuBrand(brandId, catalogue)
    ?.sections.flatMap((entry) => entry.items)
    .find((entry) => entry.id === itemId);
  return item?.priceVariants?.find((variant) =>
    Object.entries(variant.selections).every(
      ([groupId, optionId]) =>
        Array.isArray(selections[groupId]) &&
        selections[groupId].length === 1 &&
        selections[groupId][0] === optionId,
    ),
  );
}

/** Source/display amount only. Live checkout must read current database prices. */
export function launchMenuConfiguredItemPrice(
  brandId: string,
  itemId: string,
  selections: Record<string, string[]>,
  catalogue = launchMenuBrands,
): number | null {
  if (!isLaunchBrandPriceApproved(brandId)) return null;
  const item = getLaunchMenuBrand(brandId, catalogue)
    ?.sections.flatMap((entry) => entry.items)
    .find((entry) => entry.id === itemId);
  if (!item || item.available === false) return null;
  const variant = getLaunchMenuPriceVariant(brandId, itemId, selections, catalogue);
  return item.priceVariants
    ? variant?.available === false
      ? null
      : (variant?.pricePence ?? null)
    : item.pricePence;
}

export const launchMenuSourceNotes = [
  "On 7 November 2026, the owner renamed only Load’d’s King of Hearts, Queen of Hearts, Jack of Diamonds and King of Spades to Royal Flush, Double Deck, All In and The Jackpot in Loaded Fries and Full House. Existing item IDs, descriptions and prices are preserved.",
  "The owner added Biscoff and Oreo milkcakes at £3.99 each to all five menus on 6 November 2026. These are standalone desserts; the separate Sunday promotion keeps its existing activation rules.",
  "The owner’s typed menus and prices dated 5 November 2026 supersede the earlier £20 placeholders for all five launch brands.",
  "Souvano’s three approved mains each include fries, rice or naan. No extra meal charge or standalone Souvano drinks were supplied; cross-brand additions are separately priced extras.",
  "Tavo wing and tender prices depend on the exact portion and flavour together. Grilled wings use Spicy Honey BBQ; fried wings and tenders use Korean BBQ.",
  "Nuggets Meal is the current display name for both kids meals; stable IDs preserve existing catalogue references.",
  "The owner confirmed Coke, Pepsi Max, Tango Apple and water in stock on 7 November 2026. Coke is also listed for Skorch and Load’d at the existing £1 can price. Other drink identities and prices are retained; current kitchen stock controls availability.",
  "A named Load’d meal replacement is £2.99 for loaded fries or £3.99 for loaded mac ’n cheese. Moktl meal replacements are £2.99. Standalone extras retain their full item price.",
  "Milkshake upgrades remain displayed at £2.99 but unavailable until the owner supplies the flavour choices; no milkshake flavours are invented.",
  "No allergen declaration or ingredient-completeness assurance is supplied.",
  "No drink serving sizes, lamb-chop quantity, or meat species for the rashers are specified.",
  "Tavo’s Onion Rings burger add-on has no stated quantity; Skorch explicitly lists 3 Onion Rings.",
  "The included meal drink selector follows the exact standalone can/water stock in its brand and kitchen, including Coke. Red Bull remains a separate catalogue item and is not an included drink; a named Moktl or milkshake upgrade replaces the included drink.",
  "Accent colours and single/multiple presentation are UI metadata, not live availability or kitchen rules.",
];
