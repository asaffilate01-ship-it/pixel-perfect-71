# Supplied launch menu sources

`src/lib/launch-menu-catalogue.ts` combines the five supplied menu sheets with the owner's detailed replacement menus and prices dated **5 November 2026**. Revision `owner-menu-20261105-v2`, with the 6 November milkcakes and 7 November Coke additions, contains **91 products in 25 sections**. It supersedes the earlier 77-item transcription and blanket £20 placeholders. Flavours and portions remain choices on their parent products, not extra products. MealDeck's independent backend remains the authority for live availability, canonical prices, modifiers and orders.

| Operational brand ID | Display name | Sections | Products |
| -------------------- | ------------ | -------: | -------: |
| `tavo-chicken`       | Tavo Chicken |        8 |       24 |
| `moktl`              | Moktl        |        2 |       10 |
| `loadd`              | Load’d       |        6 |       30 |
| `skorch-burgers`     | Skorch       |        5 |       22 |
| `souvano`            | Souvano      |        4 |        5 |

The marketing brand ID **skorch** resolves to **skorch-burgers**; catalogue records retain the canonical operational ID.

## Owner update — 7 November 2026

Only Load’d’s **Loaded Fries** and **The Full House** dish names change:

| Previous name    | Current name |
| ---------------- | ------------ |
| King of Hearts   | Royal Flush  |
| Queen of Hearts  | Double Deck  |
| Jack of Diamonds | All In       |
| King of Spades   | The Jackpot  |

The eight distinct products keep their existing SKU, price, description and options. Named Load’d replacement choices use the corresponding new display names while retaining their existing option IDs.

The owner confirmed **Coke, Pepsi Max, Tango Apple and water** in stock. Coke is added to the Skorch/Load’d catalogue at the existing £1 can price and to Skorch’s included meal/kids drink choices. Tavo already lists Coke. Water retains its existing **Water Bottle** display name and SKU. Other drink identities and prices remain in the catalogue; current per-kitchen stock determines whether they can be selected, including in meals. The database public-menu allowlist and included-drink stock mapping require the additive Coke entries before they are offered live.

## Provenance

The original JPEG files are retained separately from the repository. SHA256 fingerprints identify their exact bytes; no generated or historical sample menus were used. Tavo’s upload contains both `TAVO / 01` and `TAVO / 02` in one image. The later typed owner instructions take precedence where an original sheet differs; affected records include an `owner-menu-20261105-v2` source reference.

| Source ID      | Supplied filename   | SHA256                                                             |
| -------------- | ------------------- | ------------------------------------------------------------------ |
| `souvano-menu` | `01-1000360481.jpg` | `adb0b1a90bd2a75802f13b65b00db428861a21dc09c91eb58c25feb5d588728c` |
| `loadd-menu`   | `02-1000360479.jpg` | `598405a171971fc0841fa6af040609e54ecb0fddc68b4deaf14be9fefddd7121` |
| `moktl-menu`   | `03-1000360478.jpg` | `0072a571488da5a0a508d3b55bc94a5d1b02ded7f1ab325009069bdb438140cc` |
| `skorch-menu`  | `04-1000360477.jpg` | `cf48293d461f52c347ec12e3e547ae3ba6bfe6440983693e972f784460dcd884` |
| `tavo-menu`    | `05-1000360462.jpg` | `3f57da29c6731bf046a2151b8ddea394cdc2b8511d9a5df6e56fcc4bb34d6f24` |

Each catalogue record has `sourceRefs`. A reference such as `tavo-menu#fried-chicken-wings` resolves to `launchMenuSources`, including source dimensions, page label where applicable, and an editorial bounding rectangle in source-image pixels. Whole-menu references support brand headings. Capitalisation and typographic apostrophes are normalised for display; supplied names, portions and descriptions are preserved.

## Content and choice rules

- **Tavo:** four burgers; fried wings, fried tenders and grilled wings each offer **3, 5 or 8 pcs**. Fried wings/tenders offer **Plain Flavour, Korean BBQ, Dynamite or Fiery Sweet Chilli**; grilled wings offer **Plain Flavour, Spicy Honey BBQ, Dynamite or Fiery Sweet Chilli**. The complete portion/flavour combination determines the price. Dipped burgers offer their three named sauces without Plain Flavour. Its onion-ring burger add-on has no stated quantity.
- **Skorch:** The Ace, Double Deal, Triple Stack and Four of a Kind retain their **1, 2, 3 and 4 patty** descriptions. Its burger add-on explicitly says **3 Onion Rings**. Do not substitute that quantity into Tavo.
- **Souvano:** three mains only: Stir-Fry Doner **£6.50**, Heatwave **£6.99**, and Lamb Chops **£9.99**. Every main includes one required **Fries / Rice / Naan** choice. Doner also requires **Plain / Fiery Sweet Chilli / Dynamite / Korean BBQ**. There is no Souvano meal surcharge or included drink; earlier unpriced drinks and optional-meal assumptions were removed.
- **Load’d:** preserve the shared toppings under Loaded Fries and the shared contents under The Full House alongside each item description. Similar product names in those two sections are distinct products.
- **Moktl:** eight named mocktails. Only Rush Hour has a supplied item description: **Energy drink flavour**. Do not infer recipes for the other drinks from their names.

Portion, flavour and included-base groups use required single selection as a browsing interface convention. Add-ons and upgrades are optional. A group’s `when` dependency hides meal-only choices until its meal option is selected. Tavo and Skorch kids meals already include fries and a drink, so their optional upgrade groups need no meal toggle. The sheets do not establish multi-upgrade combination limits.

## Current owner-approved prices — 5 November 2026

Use each product's current integer-pence price and the exact Tavo portion/flavour price matrix. The owner's detailed menus supersede all earlier £20 placeholders. Do not restore those placeholders or derive a variant price by adding independent portion and flavour surcharges.

Tavo and Skorch **Make It a Meal costs £2.50**, adding fries and an included standard can or water. Their kids meals already include fries and a drink. Each brand's own listed £1 drink range supplies its required included-drink choice; Red Bull is a separate £2.20 product. Tavo's drinks differ from the Skorch/Load’d range. Tavo chicken nuggets cost £3.50; Skorch/Load’d chicken nuggets cost £4.00. Burger add-on prices and descriptions are brand-specific.

An attached **extra** uses the target item's standalone price. A named cross-brand **replacement upgrade** costs **£2.99 for Load’d Loaded Fries**, **£3.99 for Load’d Loaded Mac ’n Cheese**, or **£2.99 for a Moktl mocktail**. Peri Salt costs £0.50. The supplied milkshake upgrade price is £2.99, but that option remains unavailable until flavours are confirmed. A replacement does not add the target's full standalone price on top of its surcharge. Each selected option is charged once per parent quantity, after validation removes conflicting generic and named replacements.

These source prices are not a Stripe payment product, signed server quote or evidence of live ordering. [The draft catalogue importer](mealdeck-launch-catalogue-import.md) derives the complete JSON/SQL and preserves subsequent backend price edits on rerun. The separate reviewed price revision checks expected old prices and records the revision required by checkout; an insert-only rerun cannot correct old published prices.

## Content still requiring review

The sources supply no approved cooking methods/times, portion weights, allergen declaration, drink recipes/serving sizes, lamb-chop quantity, rashers’ meat species, Tavo onion-ring add-on quantity, or milkshake flavours/sizes. Never invent these from a dish name or a game recipe. Staff preparation references must distinguish the confirmed dish contents and ticket choices from the kitchen's recipe and allergen sign-off. The later owner instructions supply the included drink range and cross-brand choices; they do not supply missing preparation specifications or live availability.

The 99p milk-cake promotion approved for Sunday 8 November does not itself define an Icova product, serving size, recipe or allergen record. The ten other marketing brands do not yet have confirmed operational launch menus in this catalogue.

## Owner-approved cross-brand planning — 4 November 2026

The owner explicitly requested Moktl drinks and Load’d fries upgrades across the five launch menus. `src/lib/launch-menu-upsells.ts` implements these choices using actual catalogue item IDs. A side slot offers the **four Loaded Fries and five Loaded Mac ’n Cheese products** from Load’d; a drink slot offers the **eight Moktl mocktails**. Load’d Full House products and standalone cans are not side-upgrade targets. No forthcoming brand or same-brand recommendation is introduced.

| Parent configuration                               | Load’d choice                                               | Moktl choice                                               |
| -------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Tavo or Skorch main without a meal                 | One separate extra side                                     | One separate extra drink                                   |
| Tavo or Skorch meal                                | Replaces the included fries once                            | Replaces the included drink once                           |
| Tavo or Skorch kids meal                           | Replaces its already included fries once                    | Replaces its already included drink once                   |
| Any Souvano main                                   | One separately priced extra; included Fries/Rice/Naan stays | One separately priced extra; no included drink is replaced |
| Load’d Loaded Fries, Loaded Mac or Full House main | No self-brand side recommendation                           | One separate extra drink                                   |
| Standalone sides, cans and Moktl drinks            | No cross-brand choices                                      | No cross-brand choices                                     |

Selections remain attached to the parent dish. Each parent unit has at most one named side and one named drink. Changing the parent quantity changes the quantity of both attached choices; removing the parent removes them. Different target combinations remain separate basket selections. The `mode` stored with each child distinguishes a replacement from an extra; turning a Tavo/Skorch meal off discards its upgrades instead of silently converting them into extras. Souvano's required included side remains intact alongside any explicitly purchased extra.

A specific Load’d choice clears generic Loaded Fries/Loaded Mac choices and Peri Salt. A specific Moktl choice clears generic Mocktail and Milkshake. Selecting Peri Salt later removes the Load’d replacement; selecting Milkshake later removes Moktl. This prevents conflicting replacements of the same included component. Existing saved generic choices remain readable and removable; they do not acquire an invented named target.

Saved picks keep the existing version-1 format and optionally add `crossSelections` containing only slot, mode, brand ID and item ID. Restoration rechecks those fields against the current parent configuration and catalogue. Browser-supplied names, prices, child quantities, unknown brands, wrong-section targets and stale modes cannot define a choice. Edits validate atomically before replacing a saved line. Displayed item amounts use the current source prices above; saved browser picks do not set live backend prices or create orders.

## Focused validation

Run `bun test tests/launch-menu-catalogue.test.ts` to check the current inventory, portions/flavours and price matrices, distinct ring quantities, meal dependencies, Souvano's included sides, approved prices, included choices, unique identifiers and resolvable source references.

Run `bun test tests/launch-menu-upsells.test.ts tests/launch-menu-picks.test.ts` to check actual cross-brand targets, replacement versus extra transitions, kids meals, Souvano extras, conflicting upgrades, quantity/edit rules, forged storage and backwards-compatible restoration.
