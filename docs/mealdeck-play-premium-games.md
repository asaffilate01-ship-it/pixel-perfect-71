# MealDeck Play — Premium Games & Brand Integrity
Version: October 2026 · PR branch: `feature/dishbee-play-food-cards`

## Product boundary

All MealDeck Play games are **free entertainment**, separate from paid orders and rewards. Nothing in the games writes loyalty points, cards with cash value, vouchers, free-food grants, payments, order state, betting stakes or payouts. Results are intentionally session-local. **Full House Rewards** is displayed as a locked purchase-loyalty concept until verified Dishbee server fulfilment and redemption are implemented.

MealDeck's approved **red chef-hat master logo**, `src/assets/mealdeck-card-front.png`, is not edited by the games. Its **French taco icon is never changed**. Shared branded suit images are exclusively `src/lib/food-suit-artwork.ts` (file `card-suit-french-taco.png`, not a standard Mexican taco, and not a newly invented drawing).

## Current seven-game catalogue

| Game | Mechanic | Intended result |
| --- | --- | --- |
| Food Pairs | Flip and match six pairs from selected brand's six foods | Entertaining result only |
| Recipe Rush | Build 3 named dishes from ingredient tiles, using a distinct tortilla image | Entertaining result only |
| Kitchen Chaos | Original four-colour food-suit cards, numbers 1–6, Rush, Prep Delay, Chef's Choice. Solo vs local house chef | Entertaining result only |
| Brand Snap | Compare two existing MealDeck brand logos, call SNAP or Different across twelve rounds | Entertainment-only accuracy |
| Go Dish! | Collect food-card ranks across four suits against local house chef | Entertainment-only sets |
| Full House | Select a solvable three-of-one-suit and two-of-another combination | Entertainment-only puzzle |
| Kitchen Stacks | Sort 16 numbered cards into four 1→4 suit stacks | Entertainment-only challenge |

**No people** are shown as chef card figures. Kitchen/chef rank imagery consists of neutral chef-hat and utensil symbols; external cards can be produced separately for physical print.

## Brand logo accuracy

Brand Snap uses `marketingBrands` and `cafe1Brand` from `src/lib/marketing-brands.ts`, which are exactly the **same assets the MealDeck storefront currently uses**, not AI-rendered approximations. The skin logos for Skorch, Taconelle, Load'd, Paratique, Tavo Chicken and Vyta also reference this single source of truth in `src/lib/game-brand-artwork.ts`. The default MealDeck skin uses the existing master front-card artwork. No image logos are regenerated or recoloured.

If a brand's *approved uploaded* logo differs from the asset currently in `marketingBrands`, replace the storefront's source-of-truth asset in a dedicated brand-assets review; both marketing and games will then stay consistent. Do not let automatic image generation attempt to recreate text in a logo.

## How to play / preview

On the feature branch, start MealDeck with `bun install && bun run dev` and visit `/play`. Use `/play?brand=skorch`, `?brand=taconelle` etc for branded Food Pairs.

Order tracking at `/track` links to games only from a confirmed/preparing order status, with no prize eligibility or payment side effects.

## Technical design

- `src/lib/kitchen-chaos.ts` and `src/lib/mealdeck-collection-games.ts` contain pure reducers/validators that can be tested independently.
- `src/components/play/premium-games.tsx` contains the five newer interactive game panels.
- `src/routes/play.tsx` mounts only the selected game alongside the prior two games.
- `src/styles.dishbee-play-premium.css` provides the responsive mobile-first design with keyboard focus and reduced-motion adjustments.
- `tests/dishbee-play.test.ts` and `tests/mealdeck-premium-games.test.ts` cover suits, rules, deck uniqueness, randomisation, completion and no monetary elements.
- `.github/workflows/verify.yml` runs the test suite, build, TypeScript validation and targeted lint.

## Deployment limitations

This PR does **not** activate physical printing, consumer account sync, multiplayer over the internet, guaranteed shopping loyalty redemption, Fanzeno fixtures, or central tenant entitlement checks. Companion Dishbee PR expands tenant settings to seven games, but the MealDeck demo itself is client-side and not yet gated against Dishbee's deployed entitlements.

Before releasing to the live site: obtain a successful build/test/typecheck, validate on phones and tablets, ensure all current brand logo files match the approved designs, apply Dishbee migrations to staging, and complete product and promotional-law sign-off for any separate consumer rewards.
