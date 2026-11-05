/**
 * Catalogue transcribed from the five menu sheets supplied by the owner.
 *
 * The owner approved an initial £20 for every standalone item on 5 November 2026.
 * This browse catalogue supplies the reviewed draft import; the independent
 * MealDeck backend remains the authority for live prices, stock and orders.
 * The supplied sheets contain no prices. The owner's later instruction also
 * approves £20 per selected optional add-on, meal deal or upgrade. Included
 * flavour, portion and base choices remain part of their parent item's price.
 * Required single choices below describe the printed flavour/portion/base choices;
 * optional add-ons and upgrades use the later approved £20 price without
 * inventing ingredient details or additional combination limits.
 */

export type LaunchMenuBrandId = "tavo-chicken" | "moktl" | "loadd" | "skorch-burgers" | "souvano";

export type LaunchMenuOption = {
  id: string;
  label: string;
  description?: string;
  pricePence: number;
  sourceRefs: string[];
};

export type LaunchMenuOptionGroup = {
  id: string;
  label: string;
  description?: string;
  kind: "single" | "multiple";
  required: boolean;
  when?: { groupId: string; optionIds: string[] };
  options: LaunchMenuOption[];
  sourceRefs: string[];
};

export type LaunchMenuItem = {
  id: string;
  name: string;
  description?: string;
  pricePence: number;
  optionGroupIds: string[];
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

type MenuRow = readonly [name: string, description?: string];

/** Owner-approved starting price for each standalone item, including cans/drinks. */
export const LAUNCH_ITEM_PRICE_PENCE = 2_000;
/** Owner-approved price for each selected optional add-on, meal deal or upgrade. */
export const LAUNCH_UPGRADE_PRICE_PENCE = 2_000;
/** A replacement surcharge is independent of the target item's standalone price. */
export const LAUNCH_CROSS_UPGRADE_PRICE_PENCE = 2_000;

// These are included dish choices, rather than optional paid upgrades. Explicit
// IDs keep an unrelated future required modifier from silently becoming free.
const includedChoiceGroupIds = new Set([
  "tavo-chicken-portion",
  "tavo-chicken-flavour",
  "souvano-donner-flavour",
  "souvano-heatwave-base",
  "souvano-meal-side",
]);

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
  return {
    id,
    title,
    ...(description ? { description } : {}),
    sourceRefs: [...sourceRefs],
    items: rows.map(([name, itemDescription]) => ({
      id: brandId + "-" + id + "-" + slug(name),
      name,
      ...(itemDescription ? { description: itemDescription } : {}),
      pricePence: LAUNCH_ITEM_PRICE_PENCE,
      optionGroupIds: [...optionGroupIds],
      sourceRefs: [...sourceRefs],
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
    options: rows.map(([optionLabel, optionDescription]) => ({
      id: id + "-" + slug(optionLabel),
      label: optionLabel,
      ...(optionDescription ? { description: optionDescription } : {}),
      pricePence: includedChoiceGroupIds.has(id) ? 0 : LAUNCH_UPGRADE_PRICE_PENCE,
      sourceRefs: [...sourceRefs],
    })),
  };
}

// These seven drink names are printed on each of Tavo, Skorch, Load’d and Souvano.
// Reusing the names does not imply a serving size or a particular meal inclusion.
const cansAndDrinks: readonly MenuRow[] = [
  ["Coke"],
  ["Pepsi Max"],
  ["Tango Apple"],
  ["Miranda Orange"],
  ["Miranda Strawberry"],
  ["Barr Limeade"],
  ["Water Bottle"],
];

const tavoChickenRefs = [
  "tavo-menu#fried-chicken-wings",
  "tavo-menu#fried-chicken-tenders",
  "tavo-menu#grilled-chicken-wings",
];
const tavoMealUpgradeRefs = ["tavo-menu#meal-upgrades-page-1", "tavo-menu#meal-upgrades-page-2"];
const tavoMealUpgradeRows: readonly MenuRow[] = [
  ["Peri Salt"],
  ["Loaded Fries Upgrade"],
  ["Loaded Mac ’n Cheese Upgrade"],
  ["Mocktail Upgrade"],
  ["Milkshake Upgrade"],
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

const tavo: LaunchMenuBrand = {
  id: "tavo-chicken",
  name: "Tavo Chicken",
  accent: "#D7141A",
  description: "Chicken burgers, wings & more.",
  sourceRefs: ["tavo-menu"],
  sections: [
    section(
      "tavo-chicken",
      "burgers",
      "Burgers",
      [
        ["Cruncher", "Fried chicken fillet"],
        ["Twin Crunch", "2 fried chicken fillets"],
        ["Flame", "Grilled chicken fillet"],
        ["Big Flame", "2 grilled chicken fillets"],
      ],
      ["tavo-menu#burgers"],
      "All burgers with lettuce, cheese, gherkin, caramelised onion & Algerian sauce.",
      tavoBurgerGroupIds,
    ),
    section(
      "tavo-chicken",
      "fried-chicken-wings",
      "Fried Chicken Wings",
      [["Fried Chicken Wings"]],
      ["tavo-menu#fried-chicken-wings"],
      undefined,
      tavoChickenGroupIds,
    ),
    section(
      "tavo-chicken",
      "fried-chicken-tenders",
      "Fried Chicken Tenders",
      [["Fried Chicken Tenders"]],
      ["tavo-menu#fried-chicken-tenders"],
      undefined,
      tavoChickenGroupIds,
    ),
    section(
      "tavo-chicken",
      "grilled-chicken-wings",
      "Grilled Chicken Wings",
      [["Grilled Chicken Wings"]],
      ["tavo-menu#grilled-chicken-wings"],
      undefined,
      tavoChickenGroupIds,
    ),
    section(
      "tavo-chicken",
      "kids-meals",
      "Kids Meals",
      [["Little Jacks Nugget Meal", "6 nuggets, fries & drink."]],
      ["tavo-menu#kids-meals"],
      undefined,
      ["tavo-chicken-kids-meal-upgrades"],
    ),
    section(
      "tavo-chicken",
      "sides",
      "Sides",
      [
        ["Fries"],
        ["Peri Fries"],
        ["Onion Rings (x6)"],
        ["Mozzarella Sticks (x6)"],
        ["Chilli Cheese Nuggets (x6)"],
        ["Chicken Nuggets (x6)"],
      ],
      ["tavo-menu#sides"],
    ),
    section("tavo-chicken", "cans-drinks", "Cans & Drinks", cansAndDrinks, [
      "tavo-menu#cans-drinks",
    ]),
  ],
  optionGroups: [
    group(
      "tavo-chicken-portion",
      "Portion",
      "single",
      true,
      [["3 pcs"], ["5 pcs"], ["8 pcs"]],
      tavoChickenRefs,
    ),
    group(
      "tavo-chicken-flavour",
      "Flavour",
      "single",
      true,
      [["Plain Flavour"], ["Korean BBQ"], ["Dynamite"], ["Fiery Sweet Chilli"]],
      tavoChickenRefs,
    ),
    group(
      "tavo-chicken-dipped-burger",
      "Upgrade to a Dipped Burger",
      "single",
      false,
      [["Korean BBQ"], ["Dynamite"], ["Fiery Sweet Chilli"]],
      ["tavo-menu#dipped-burger"],
      "Turn any burger into a dipped burger for an extra kick. Choose your dip:",
    ),
    group(
      "tavo-chicken-burger-add-ons",
      "Burger Add Ons",
      "multiple",
      false,
      [["2 Rashers"], ["Onion Rings"], ["Cheese Slice"]],
      ["tavo-menu#burger-add-ons"],
    ),
    group(
      "tavo-chicken-make-it-a-meal",
      "Make It a Meal",
      "single",
      false,
      [["Make it a meal", "Fries and drink."]],
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
      label: "Upgrade to a Dipped Burger",
      description: "Turn any burger into a dipped burger for an extra kick.",
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
  sourceRefs: ["moktl-menu"],
  sections: [
    section(
      "moktl",
      "mocktail-lounge",
      "Mocktail Lounge",
      [
        ["Virgin Mojito"],
        ["Mango Mirage"],
        ["Lychee Breeze"],
        ["Apple Rush"],
        ["Blue Wave"],
        ["Strawberry Splash"],
        ["Passion Paradise"],
        ["Rush Hour", "Energy drink flavour"],
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
  sourceRefs: ["loadd-menu"],
  sections: [
    section(
      "loadd",
      "loaded-fries",
      "Loaded Fries",
      [
        ["King of Hearts", "Fried chicken"],
        ["Queen of Hearts", "Grilled chicken"],
        ["Jack of Diamonds", "Chicken shawarma"],
        ["King of Spades", "Smash beef"],
      ],
      ["loadd-menu#loaded-fries"],
      "All with cheese, Algerian sauce, and spring onions.",
    ),
    section(
      "loadd",
      "loaded-mac-cheese",
      "Loaded Mac ’n Cheese",
      [
        ["Ace Mac", "Mac n cheese."],
        ["Jack’s Mac", "Fried chicken, Algerian sauce & crispy fried onions."],
        ["Diamond Melt", "Chicken shawarma, Algerian sauce & crispy fried onions."],
        ["Spade Stack", "Smash beef, Algerian sauce & crispy fried onions."],
        ["King’s Mac", "Grilled chicken, Algerian sauce & crispy fried onions."],
      ],
      ["loadd-menu#loaded-mac-cheese"],
    ),
    section(
      "loadd",
      "full-house",
      "The Full House",
      [
        ["King of Hearts", "Fried chicken, loaded fries and mac ’n cheese."],
        ["Queen of Hearts", "Grilled chicken, loaded fries and mac ’n cheese."],
        ["Jack of Diamonds", "Chicken shawarma, loaded fries and mac ’n cheese."],
        ["King of Spades", "Smashed beef, loaded fries and mac ’n cheese."],
      ],
      ["loadd-menu#full-house"],
      "The best of both worlds. Loaded fries and mac ’n cheese together in one box, topped with cheese, Algerian sauce, spring onions and crispy fried onions.",
    ),
    section("loadd", "cans-drinks", "Cans & Drinks", cansAndDrinks, ["loadd-menu#cans-drinks"]),
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
  sourceRefs: ["skorch-menu"],
  sections: [
    section(
      "skorch-burgers",
      "beef-smash-deck",
      "The Beef Smash Deck",
      [
        ["The Ace", "Single beef smash – 1 patty."],
        ["Double Deal", "Double beef smash – 2 patties."],
        ["Triple Stack", "Triple beef smash – 3 patties."],
        ["Four of a Kind", "Quadruple beef smash – 4 patties."],
      ],
      ["skorch-menu#beef-smash-deck"],
      "All burgers come with cheese, gherkin, caramelised onion & Algerian sauce.",
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
      [["Little Jack’s Nuggets Meal", "6 nuggets, fries & drink."]],
      ["skorch-menu#kids-meal"],
      undefined,
      ["skorch-burgers-kids-meal-upgrades"],
    ),
    section(
      "skorch-burgers",
      "sides",
      "Sides",
      [
        ["Fries"],
        ["Peri Fries"],
        ["Onion Rings (x6)"],
        ["Mozzarella Sticks (x6)"],
        ["Chilli Cheese Nuggets (x6)"],
        ["Chicken Nuggets (x6)"],
      ],
      ["skorch-menu#sides"],
    ),
    section("skorch-burgers", "cans-drinks", "Cans & Drinks", cansAndDrinks, [
      "skorch-menu#cans-drinks",
    ]),
  ],
  optionGroups: [
    group(
      "skorch-burgers-burger-add-ons",
      "Burger Add-ons",
      "multiple",
      false,
      [["2 Rashers"], ["3 Onion Rings"], ["Cheese Slice"]],
      ["skorch-menu#burger-add-ons"],
    ),
    group(
      "skorch-burgers-make-it-a-meal",
      "Make It a Meal",
      "single",
      false,
      [["Make it a meal", "Add fries & a drink."]],
      ["skorch-menu#make-it-a-meal"],
    ),
    group(
      "skorch-burgers-meal-upgrades",
      "Meal Upgrades",
      "multiple",
      false,
      [["Peri Salt"], ["Loaded Fries"], ["Loaded Mac ’n’ Cheese"], ["Mocktail"], ["Milkshake"]],
      ["skorch-menu#meal-upgrades"],
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
      [["Peri Salt"], ["Loaded Fries"], ["Loaded Mac ’n’ Cheese"], ["Mocktail"], ["Milkshake"]],
      ["skorch-menu#meal-upgrades"],
    ),
  ],
  upsells: [
    {
      id: "skorch-burgers-upsell-meal",
      label: "Make It a Meal",
      description: "Add fries & a drink.",
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

const souvanoMealRefs = [
  "souvano-menu#stir-fry-donner",
  "souvano-menu#heatwave",
  "souvano-menu#lamb-chops",
];
const souvano: LaunchMenuBrand = {
  id: "souvano",
  name: "Souvano",
  accent: "#C85600",
  description: "Mediterranean grill.",
  sourceRefs: ["souvano-menu"],
  sections: [
    section(
      "souvano",
      "stir-fry-donner",
      "Stir Fry Donner",
      [["Stir Fry Donner"]],
      ["souvano-menu#stir-fry-donner"],
      undefined,
      ["souvano-donner-flavour", "souvano-make-it-a-meal", "souvano-meal-side"],
    ),
    section(
      "souvano",
      "heatwave",
      "Heatwave",
      [
        [
          "Heatwave",
          "Chopped grilled chicken shawarma style, over a bed of fragrant spicy rice/naan/fries, and a side of fresh salad.",
        ],
      ],
      ["souvano-menu#heatwave"],
      undefined,
      ["souvano-heatwave-base", "souvano-make-it-a-meal"],
    ),
    section(
      "souvano",
      "lamb-chops",
      "Lamb Chops",
      [["Lamb Chops", "Spicy Middle Eastern Kick (Flavour)"]],
      ["souvano-menu#lamb-chops"],
      undefined,
      ["souvano-make-it-a-meal", "souvano-meal-side"],
    ),
    section("souvano", "cans-drinks", "Cans & Drinks", cansAndDrinks, ["souvano-menu#cans-drinks"]),
  ],
  optionGroups: [
    group(
      "souvano-donner-flavour",
      "Flavour",
      "single",
      true,
      [["Plain"], ["Fiery Sweet Chilli"], ["Dynamite"], ["Korean BBQ"]],
      ["souvano-menu#stir-fry-donner"],
    ),
    group(
      "souvano-heatwave-base",
      "Base",
      "single",
      true,
      [["Fragrant spicy rice"], ["Naan"], ["Fries"]],
      ["souvano-menu#heatwave"],
    ),
    group(
      "souvano-make-it-a-meal",
      "Make It a Meal",
      "single",
      false,
      [["Make it a meal", "With your choice of Fries, Rice or Naan & a Drink"]],
      souvanoMealRefs,
      "With your choice of Fries, Rice or Naan & a Drink",
    ),
    group(
      "souvano-meal-side",
      "Meal side",
      "single",
      true,
      [["Fries"], ["Rice"], ["Naan"]],
      souvanoMealRefs,
      undefined,
      {
        groupId: "souvano-make-it-a-meal",
        optionIds: ["souvano-make-it-a-meal-make-it-a-meal"],
      },
    ),
  ],
  upsells: [
    {
      id: "souvano-upsell-meal",
      label: "Make It a Meal",
      description: "With your choice of Fries, Rice or Naan & a Drink",
      optionGroupId: "souvano-make-it-a-meal",
      sourceRefs: souvanoMealRefs,
    },
    {
      id: "souvano-upsell-drinks",
      label: "Cans & Drinks",
      targetBrandId: "souvano",
      targetSectionId: "cans-drinks",
      sourceRefs: ["souvano-menu#cans-drinks"],
    },
  ],
};

/**
 * 5 supplied brands, 20 sections, 77 products.
 * Portion/flavour variants are choices, not duplicated products.
 */
export const launchMenuBrands: LaunchMenuBrand[] = [tavo, moktl, loadd, skorch, souvano];

export function getLaunchMenuBrand(id: string): LaunchMenuBrand | undefined {
  const canonicalId = id === "skorch" ? "skorch-burgers" : id;
  return launchMenuBrands.find((brand) => brand.id === canonicalId);
}

/** Editorial gaps to preserve when preparing a server-owned live catalogue. */
export const launchMenuSourceNotes = [
  "The owner approved an initial £20 per standalone item on 5 November 2026, including sides, cans and mocktails; the supplied sheets themselves print no prices.",
  "The owner also approved £20 per selected optional add-on, meal deal and upgrade on 5 November 2026. Required included flavour, portion and base choices have no extra charge.",
  "No allergen declaration or ingredient-completeness assurance is supplied.",
  "No drink serving sizes, lamb-chop quantity, or meat species for the rashers are specified.",
  "Tavo's Onion Rings burger add-on has no stated quantity; Skorch explicitly lists 3 Onion Rings.",
  "Tavo prints Little Jacks Nugget Meal; Skorch prints Little Jack’s Nuggets Meal. Their names are retained separately.",
  "Milkshake upgrades are £20 under the owner's blanket upgrade instruction, but no milkshake flavours, sizes or fulfilment brand are supplied.",
  "The sheets do not state which listed cans or drinks qualify for a meal, or how upgrades substitute for its contents.",
  "Meal-upgrade groups are available to browse for meals; no per-option combination limits are supplied.",
  "Heatwave names an included rice/naan/fries base and separately repeats the meal offer. This does not establish a second base or an extra charge.",
  "No third-party brand is named for the generic Loaded Fries, Loaded Mac ’n Cheese or Mocktail upgrades; cross-brand fulfilment mappings remain unspecified.",
  "Accent colours and single/multiple presentation are UI metadata; they do not establish prices, live availability or kitchen rules.",
];
