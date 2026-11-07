import type { LaunchMenuBrandId } from "./launch-menu-catalogue";

/** Editorial descriptions of the approved menus, not live stock or price claims. */
export type MealDeckMenuPage = {
  brandId: LaunchMenuBrandId;
  brandName: string;
  path: `/menus/${LaunchMenuBrandId}`;
  title: string;
  description: string;
  heading: string;
  intro: string;
  linkLabel: string;
  faqs: readonly { q: string; a: string }[];
};

export const MEALDECK_MENU_PAGES = [
  {
    brandId: "skorch-burgers",
    brandName: "Skorch",
    path: "/menus/skorch-burgers",
    title: "Smash Burgers Luton | Skorch by MealDeck",
    description:
      "Choose Skorch beef smash burgers in Luton, from a single patty to a four-patty stack. Add sides and collect from MealDeck on Selbourne Road.",
    heading: "Smash burgers in Luton",
    intro:
      "Skorch Burgers brings single, double, triple and four-patty beef smash burgers to MealDeck. Build your meal with fries and a drink, or mix in another brand for one collection or kerbside pickup.",
    linkLabel: "Smash burgers",
    faqs: [
      {
        q: "What is on the Skorch burger menu?",
        a: "The Beef Smash Deck runs from The Ace with one beef patty to Double Deal, Triple Stack and Four of a Kind. Browse the menu for each burger’s ingredients, current price and available extras.",
      },
      {
        q: "Can I order loaded fries with my burger?",
        a: "Skorch and Load’d can share one MealDeck basket. Choose a burger, then browse Load’d for loaded fries or mac and cheese. The available extras and meal upgrades are shown when you customise your food.",
      },
      {
        q: "Where do I collect my Skorch order?",
        a: "Collect from MealDeck at 314–318 Selbourne Road, Luton, LU4 8NU, or select kerbside pickup during kitchen opening hours. Follow the progress on your order confirmation page and have your collection code ready.",
      },
    ],
  },
  {
    brandId: "tavo-chicken",
    brandName: "Tavo Chicken",
    path: "/menus/tavo-chicken",
    title: "Chicken Wings & Burgers Luton | Tavo Chicken by MealDeck",
    description:
      "Explore Tavo chicken wings, fried tenders and chicken burgers in Luton. Choose your portion and flavour for collection or kerbside at MealDeck.",
    heading: "Chicken wings & burgers in Luton",
    intro:
      "Choose fried or grilled chicken wings, fried chicken tenders, or a buttermilk fried or spicy grilled chicken burger. Mix your Tavo choices with Load’d sides and Moktl mocktails in one MealDeck order.",
    linkLabel: "Chicken wings & burgers",
    faqs: [
      {
        q: "Does Tavo serve fried and grilled chicken wings?",
        a: "The menu includes fried chicken wings, grilled chicken wings and fried chicken tenders. Choose your portion and flavour on the item; the current price reflects that exact combination.",
      },
      {
        q: "Which chicken burgers can I choose?",
        a: "Cruncher and Twin Crunch use buttermilk fried chicken fillets. Flame and Big Flame use spicy grilled chicken fillets. Each burger lists its ingredients and available add-ons in the menu.",
      },
      {
        q: "Is Tavo Chicken part of Wingstop?",
        a: "No. Tavo Chicken is a MealDeck brand and is not affiliated with Wingstop. This is Tavo’s own menu of chicken wings, tenders and burgers for Luton collection or kerbside pickup.",
      },
    ],
  },
  {
    brandId: "loadd",
    brandName: "Load’d",
    path: "/menus/loadd",
    title: "Loaded Fries & Mac and Cheese Luton | Load’d by MealDeck",
    description:
      "Browse Load’d loaded fries and mac and cheese in Luton, with fried chicken, grilled chicken, shawarma or smash beef. Order for collection or kerbside.",
    heading: "Loaded fries & mac and cheese in Luton",
    intro:
      "Start with loaded fries, choose loaded mac and cheese, or bring both together in a Full House box. Load’d has fried chicken, grilled chicken, chicken shawarma and smash beef toppings to choose from.",
    linkLabel: "Loaded fries & mac and cheese",
    faqs: [
      {
        q: "Is Loadd the same as Load’d?",
        a: "Yes. Loadd is the plain-text spelling of Load’d, MealDeck’s loaded fries and mac and cheese brand. You can browse the full Load’d menu here.",
      },
      {
        q: "What toppings are on the loaded fries?",
        a: "Choose fried chicken, grilled chicken, chicken shawarma or smash beef. The loaded-fries menu describes the cheese, Algerian sauce and spring onion toppings for each choice. Check the item for its current options and availability.",
      },
      {
        q: "What is the difference between loaded fries and the Full House?",
        a: "Loaded fries have a fries base. The Full House combines loaded fries and mac and cheese in one box, with your chosen topping. Load’d also has a separate loaded mac and cheese section, including plain Ace Mac.",
      },
      {
        q: "Can I order Load’d with food from the other menus?",
        a: "Yes. Add Load’d alongside Skorch burgers, Tavo chicken, Souvano food or Moktl mocktails in one MealDeck basket. Your order is prepared for one collection or kerbside pickup from the Luton kitchen.",
      },
    ],
  },
  {
    brandId: "souvano",
    brandName: "Souvano",
    path: "/menus/souvano",
    title: "Doner & Lamb Chops Luton | Souvano by MealDeck",
    description:
      "Explore Souvano’s stir-fry doner, spicy chicken and lamb chops in Luton, with fries, rice or naan. Browse the menu for MealDeck collection or kerbside.",
    heading: "Doner & lamb chops in Luton",
    intro:
      "Explore Souvano’s Greek and Turkish food menu, with stir-fry doner, Heatwave spicy Middle Eastern chicken and lamb chops. Each main includes your choice of fries, rice or naan.",
    linkLabel: "Doner, chicken & lamb chops",
    faqs: [
      {
        q: "Which doner flavours are on the Souvano menu?",
        a: "Stir-Fry Doner has Plain, Fiery Sweet Chilli, Dynamite and Korean BBQ choices. Select the flavour and your included fries, rice or naan when customising the dish.",
      },
      {
        q: "What is Heatwave?",
        a: "Heatwave is Souvano’s spicy Middle Eastern chopped and shredded chicken dish, with a choice of fries, rice or naan included. Its current price and available choices appear in the menu.",
      },
      {
        q: "Does Souvano have lamb chops?",
        a: "The menu includes lamb chops with Middle Eastern flavour and your choice of fries, rice or naan. You can add drinks or desserts from the other MealDeck menus to the same collection order.",
      },
      {
        q: "Does Souvano have Greek wraps or Turkish wraps?",
        a: "Souvano currently lists Stir-Fry Doner, Heatwave chicken and lamb chops with a choice of fries, rice or naan. A Greek wrap or Turkish wrap is not a separate item on this menu. Browse the dishes shown here for their current choices.",
      },
    ],
  },
  {
    brandId: "moktl",
    brandName: "Moktl",
    path: "/menus/moktl",
    title: "Mocktail Drinks Luton | Moktl by MealDeck",
    description:
      "Find Moktl zero-alcohol mocktail drinks in Luton, including Virgin Mojito and Mango Mirage. Add food or milk cake for one MealDeck collection.",
    heading: "Mocktail drinks in Luton",
    intro:
      "Moktl’s mocktail lounge brings zero-alcohol drinks to the MealDeck menu. Choose a Virgin Mojito or explore the fruit-flavoured collection, then pair your drink with food or a milk cake.",
    linkLabel: "Mocktail drinks & virgin mojitos",
    faqs: [
      {
        q: "Which mocktails can I find at Moktl?",
        a: "The menu includes Virgin Mojito, Mango Mirage, Strawberry Splash, Passion Paradise, Lychee Breeze and Apple Rush. Check the menu for today’s prices and availability.",
      },
      {
        q: "Are Moktl mocktails alcohol-free?",
        a: "Moktl is MealDeck’s zero-alcohol mocktail menu. Browse each named drink and add it to your basket alongside any food you choose.",
      },
      {
        q: "Can I add a dessert to my mocktail order?",
        a: "Browse the Desserts section for Biscoff Milkcake and Oreo Milkcake. You can add a milk cake and a mocktail to the same MealDeck basket for collection or kerbside pickup in Luton.",
      },
    ],
  },
] as const satisfies readonly MealDeckMenuPage[];

/** Only approved launch menus receive an indexable local menu page. */
export function getMealDeckMenuPage(brandId?: string): MealDeckMenuPage | undefined {
  return MEALDECK_MENU_PAGES.find((page) => page.brandId === brandId);
}
