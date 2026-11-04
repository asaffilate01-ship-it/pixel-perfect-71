# Supplied launch menu sources

`src/lib/launch-menu-catalogue.ts` transcribes the five menu sheets supplied by the owner. It contains **77 products in 20 sections**. Flavours and portions are choices on their parent products, not extra products. The catalogue is for menu browsing; Dishbee remains the authority for live availability, prices, modifiers and orders.

| Operational brand ID | Display name | Sections | Products |
| -------------------- | ------------ | -------: | -------: |
| `tavo-chicken`       | Tavo Chicken |        7 |       21 |
| `moktl`              | Moktl        |        1 |        8 |
| `loadd`              | Load’d       |        4 |       20 |
| `skorch-burgers`     | Skorch       |        4 |       18 |
| `souvano`            | Souvano      |        4 |       10 |

The marketing brand ID **skorch** resolves to **skorch-burgers**; catalogue records retain the canonical operational ID.

## Provenance

The original JPEG files are retained separately from the repository. SHA256 fingerprints identify their exact bytes; no generated or historical sample menus were used. Tavo’s upload contains both `TAVO / 01` and `TAVO / 02` in one image.

| Source ID      | Supplied filename   | SHA256                                                             |
| -------------- | ------------------- | ------------------------------------------------------------------ |
| `souvano-menu` | `01-1000360481.jpg` | `adb0b1a90bd2a75802f13b65b00db428861a21dc09c91eb58c25feb5d588728c` |
| `loadd-menu`   | `02-1000360479.jpg` | `598405a171971fc0841fa6af040609e54ecb0fddc68b4deaf14be9fefddd7121` |
| `moktl-menu`   | `03-1000360478.jpg` | `0072a571488da5a0a508d3b55bc94a5d1b02ded7f1ab325009069bdb438140cc` |
| `skorch-menu`  | `04-1000360477.jpg` | `cf48293d461f52c347ec12e3e547ae3ba6bfe6440983693e972f784460dcd884` |
| `tavo-menu`    | `05-1000360462.jpg` | `3f57da29c6731bf046a2151b8ddea394cdc2b8511d9a5df6e56fcc4bb34d6f24` |

Each catalogue record has `sourceRefs`. A reference such as `tavo-menu#fried-chicken-wings` resolves to `launchMenuSources`, including source dimensions, page label where applicable, and an editorial bounding rectangle in source-image pixels. Whole-menu references support brand headings. Capitalisation and typographic apostrophes are normalised for display; supplied names, portions and descriptions are preserved.

## Content and choice rules

- **Tavo:** four burgers; fried wings, fried tenders and grilled wings each offer **3, 5 or 8 pcs** and **Plain Flavour, Korean BBQ, Dynamite or Fiery Sweet Chilli**. Dipped burgers offer the three named sauces without Plain Flavour. Its onion-ring burger add-on has no stated quantity.
- **Skorch:** The Ace, Double Deal, Triple Stack and Four of a Kind retain their **1, 2, 3 and 4 patty** descriptions. Its burger add-on explicitly says **3 Onion Rings**. Do not substitute that quantity into Tavo.
- **Souvano:** Donner retains its four flavours. Heatwave’s included rice/naan/fries base is a required single choice. The optional meal exposes a required Fries/Rice/Naan side for Donner and Lamb Chops. Heatwave retains one base selector, avoiding an invented second base.
- **Load’d:** preserve the shared toppings under Loaded Fries and the shared contents under The Full House alongside each item description. Similar product names in those two sections are distinct products.
- **Moktl:** eight named mocktails. Only Rush Hour has a supplied item description: **Energy drink flavour**. Do not infer recipes for the other drinks from their names.

Portion, flavour and included-base groups use required single selection as a browsing interface convention. Add-ons and upgrades are optional. A group’s `when` dependency hides meal-only choices until its meal option is selected. Tavo and Skorch kids meals already include fries and a drink, so their optional upgrade groups need no meal toggle. The sheets do not establish multi-upgrade combination limits.

## Deliberately unspecified

Every item and option has **`pricePence: null`** because the sheets print no prices. Null does not mean zero, free, or an estimated surcharge. No old sample prices are inherited.

The sources supply no allergen declaration, drink serving sizes, lamb-chop quantity, rashers’ meat species, or milkshake flavours/sizes. Listed cans are standalone products; the sheets do not establish which qualify for a meal or how upgrades substitute for its contents. Generic Loaded Fries, Loaded Mac ’n Cheese and Mocktail upgrades do not name a fulfilment brand, so those cross-brand mappings remain unspecified. Upsell destinations only point to sections explicitly present in the supplied catalogue.

## Focused validation

Run `bun test tests/launch-menu-catalogue.test.ts` to check the transcribed portions/flavours, distinct ring quantities, meal dependencies, Heatwave’s single base, unknown prices, unique identifiers and resolvable source references.
