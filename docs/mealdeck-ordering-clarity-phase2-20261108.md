# MealDeck ordering clarity — phase 2

This follows the Order Now centre card, Add controls, prominent KDS flavours and Souvano main/side separation. It is presentation-only: no database operation, prices, payment logic, purchased snapshots, stock or kitchen-stage changes.

## Changes

- KDS flavour emphasis respects the saved modifier group. A sauce/add-on named Dynamite or Korean BBQ is not labelled as the main cooking flavour. Burger dips stay distinct; explicit flavour/portion variants retain both values. Multiple choices per parent retain their recorded quantity. Unknown bare legacy names stay visible as ordinary choices rather than acquiring an invented role.
- Old Souvano main spellings (Doner/Donner, common hyphens) are recognised without rewriting them. Any saved main naming both lamb chops and doner receives VERIFY MAIN, never an assumed selection. Only known shared-side group prefixes are shortened; the customer's selected side and any trailing notes are unchanged, including in completed-ticket presentation.
- Preserve the publishing branch’s existing 14 stable product subtitle lines for Load’d and Heatwave, and Moktl’s no-extra-subtitle presentation. These branch-specific changes are carried into main rather than overwritten.
- Other customer dish subtitles strip only the importer's exact repeated section paragraph. Long copy remains in the existing full description, not the prominent badge. Full House includes its explicitly described topping; burger counts come from unambiguous published descriptions, never optional upgrades.

## Verification

`node --experimental-strip-types --test tests/mealdeck-ordering-clarity.test.mjs`

The dependency-free Node 22 tests import the actual three TypeScript modules. At implementation, 56 tests passed across four suites. Syntax checks passed for the three modules. The existing Bun catalogue-descriptor assertion is updated for the more specific Full House caption. A scoped GitHub workflow runs the same regressions on pull requests and the two maintained branches.

This evidence is not a full application build, browser-layout test or physical KDS order test. Those remain separate release checks. Do not equate a Lovable project marked `is_published` or a pending deployment request with proof of the exact version served at the custom domain.

## Acceptance examples

- Stir-Fry Doner + Korean BBQ + Rice: the actual main remains separate from flavour and included side.
- Lamb Chops + Naan: no Doner alternative appears in the side caption.
- Dynamite in a Sauces or Add-ons group: ordinary selected sauce, not the parent's flavour instruction.
- Load’d Double Deck retains Grilled Chicken Loaded Fries; its Full House version retains Grilled Chicken Loaded Fries & Mac ’n Cheese. Heatwave retains Chopped and Shredded Chicken.
- An older main literally naming both dishes: VERIFY MAIN, with the saved text retained.
