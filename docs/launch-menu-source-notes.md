# Supplied launch menu sources

`src/lib/launch-menu-catalogue.ts` transcribes the five menu sheets supplied by the owner. It contains **77 products in 20 sections**. Flavours and portions are choices on their parent products, not extra products. The later owner pricing decision below sets the initial display/import prices. MealDeck's independent backend remains the authority for live availability, canonical prices, modifiers and orders.

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

## Owner-approved starting prices — 5 November 2026

The owner instructed that every standalone menu item should start at **£20**, with all optional add-ons, meal deals and upgrades also **£20 each**, so prices can be edited later. This approval supersedes the earlier unpriced catalogue. It includes sides, cans, bottled water, Moktl drinks and kids meals. No historical sample price was inherited.

Every standalone item has `pricePence: 2000`. Each optional source option has `pricePence: 2000`. Included portion, flavour and base choices have `pricePence: 0`: Tavo's portion/flavour selectors and Souvano's Donner flavour, Heatwave base and conditional meal-side selector. Those choices describe the food already included in the parent price. The optional Make It a Meal selection itself is £20.

An attached **extra** uses the target item's standalone price; a named cross-brand **replacement upgrade** uses the separate `LAUNCH_CROSS_UPGRADE_PRICE_PENCE` surcharge of £20. A replacement does not add the target's full standalone price on top of that surcharge. Each selected add-on/upgrade is charged once per parent quantity, after the existing choice rules remove conflicting generic and named upgrades.

These initial source prices are not a Stripe payment product, signed server quote or evidence of live ordering. [The draft catalogue importer](mealdeck-launch-catalogue-import.md) derives the complete JSON/SQL from this catalogue and preserves subsequent backend price edits on rerun.

## Content still requiring review

The sources supply no allergen declaration, drink serving sizes, lamb-chop quantity, rashers’ meat species, or milkshake flavours/sizes. Listed cans are standalone products; the sheets do not establish which qualify for a meal. Generic Loaded Fries, Loaded Mac ’n Cheese and Mocktail upgrades do not name a fulfilment brand. The later owner instruction below supplies cross-brand planning and substitution rules separately from the sheet transcription. The pricing instruction supplies no serving sizes, allergen assurances or live availability.

## Owner-approved cross-brand planning — 4 November 2026

The owner explicitly requested Moktl drinks and Load’d fries upgrades across the five launch menus. `src/lib/launch-menu-upsells.ts` implements these choices using actual catalogue item IDs. A side slot offers the **four Loaded Fries and five Loaded Mac ’n Cheese products** from Load’d; a drink slot offers the **eight Moktl mocktails**. Load’d Full House products and standalone cans are not side-upgrade targets. No forthcoming brand or same-brand recommendation is introduced.

| Parent configuration                                          | Load’d choice                                              | Moktl choice                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Tavo or Skorch main without a meal                            | One separate extra side                                    | One separate extra drink                                         |
| Tavo or Skorch meal                                           | Replaces the included fries once                           | Replaces the included drink once                                 |
| Tavo or Skorch kids meal                                      | Replaces its already included fries once                   | Replaces its already included drink once                         |
| Souvano Donner or Lamb Chops without a meal                   | One separate extra side                                    | One separate extra drink                                         |
| Souvano Donner or Lamb Chops meal with Fries                  | Replaces that meal side once                               | Replaces the included drink once                                 |
| Souvano meal with Rice or Naan                                | No Load’d substitution; preserves Rice/Naan                | Replaces the included drink once                                 |
| Heatwave with its included Fries base                         | Replaces that existing base once, with or without the meal | Replaces the meal drink, or is an extra when no meal is selected |
| Heatwave with Rice or Naan, or without a required base choice | No Load’d choice; never adds a second base                 | Replaces the meal drink, or is an extra when no meal is selected |
| Load’d Loaded Fries, Loaded Mac or Full House main            | No self-brand side recommendation                          | One separate extra drink                                         |
| Standalone sides, cans and Moktl drinks                       | No cross-brand choices                                     | No cross-brand choices                                           |

Selections remain attached to the parent dish. Each parent unit has at most one named side and one named drink. Changing the parent quantity changes the quantity of both attached choices; removing the parent removes them. Different target combinations remain separate basket selections. The `mode` stored with each child distinguishes a replacement from an extra; turning a Tavo/Skorch meal off discards its upgrades instead of silently converting them into extras. Heatwave may retain its Load’d replacement after turning the meal off because its fries base is still included. Switching that base to Rice or Naan removes the replacement.

A specific Load’d choice clears generic Loaded Fries/Loaded Mac choices and Peri Salt. A specific Moktl choice clears generic Mocktail and Milkshake. Selecting Peri Salt later removes the Load’d replacement; selecting Milkshake later removes Moktl. This prevents conflicting replacements of the same included component. Existing saved generic choices remain readable and removable; they do not acquire an invented named target.

Saved picks keep the existing version-1 format and optionally add `crossSelections` containing only slot, mode, brand ID and item ID. Restoration rechecks those fields against the current parent configuration and catalogue. Browser-supplied names, prices, child quantities, unknown brands, wrong-section targets and stale modes cannot define a choice. Edits validate atomically before replacing a saved line. Displayed item amounts use the current source prices above; saved browser picks do not set live backend prices or create orders.

## Focused validation

Run `bun test tests/launch-menu-catalogue.test.ts` to check the transcribed portions/flavours, distinct ring quantities, meal dependencies, Heatwave’s single base, approved item/upgrade prices, included choices, unique identifiers and resolvable source references.

Run `bun test tests/launch-menu-upsells.test.ts tests/launch-menu-picks.test.ts` to check actual cross-brand targets, replacement versus extra transitions, kids meals, Heatwave’s single base, conflicting upgrades, quantity/edit rules, forged storage and backwards-compatible restoration.
