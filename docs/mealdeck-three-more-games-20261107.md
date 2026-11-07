# MealDeck: three more games

Date: 7 November 2026

## Scope

The owner requested another few games after the sixteen-game/playbook release. This phase adds three original local games, bringing the arcade to nineteen. All three load on demand and use the existing food artwork, React components and scoped MealDeck colours. No new dependency, account, backend service or reward entitlement is required.

## Games and controls

- **Snack Trail**: collect food while avoiding the walls and your own trail. Slow and Standard movement modes sit alongside untimed Step play. Use keyboard arrows within the board or the large on-screen direction pad. Movement begins explicitly, pauses when interrupted and resumes only through the player's control.
- **Skewer Sort**: move the top bite onto an empty skewer or a matching food, with three bites per skewer. Choose three or four food types, using two empty skewers to rearrange them. Original finite puzzle layouts have legal solution certificates; seeded food and skewer permutations preserve solvability. Undo and restart provide recovery without a timer.
- **Pantry Sweep**: reveal safe squares using adjacent chilli counts. Five- and six-column boards offer a safe first reveal, a visible flag mode and keyboard navigation. Hidden square contents remain out of DOM/accessibility labels until the round ends.

## Discovery and playbook

New on the menu highlights these three games. Quick play is a separate category for Snack Trail; the two untimed puzzles sit under Puzzles. The existing search, favourites, filtered suggestions, focused view and mobile picker remain the entry points.

The playbook now tracks eight games. Its validated optional score field records Snack Trail's collected food; result labels distinguish a finished trail or a found chilli from a chef match. Earlier saved rounds and the three existing daily challenges remain valid. Stable round IDs, clear-history behaviour and cross-tab storage handling continue to apply. Only terminal rounds are recorded; leaving a board is not completion and unfinished boards are not restored after reload.

## Verification and publication

- The complete arcade regression command passed **150 tests / 56,210 assertions**, including independent Skewer Sort solving, all Pantry first-reveal positions, a legal Snack Trail full-board win, timer cancellation and backwards-compatible playbook parsing.
- Full TypeScript and scoped game/shared-integration ESLint passed. The production build passed when run on its own; an earlier concurrent preview/build run was killed by the workspace before Nitro finished.
- Browser acceptance completed a Skewer Sort puzzle after an illegal-move/Undo check, cleared a Pantry Sweep board using visible clues, and collected food/finished a Snack Trail round. Each produced one correctly labelled playbook result while earlier history remained visible.
- At narrow widths, Snack Trail's direction pad now follows its board directly. Pantry Sweep's six-column board gains space inside the card at 320px while preserving 44px cells. Picker interruption retains the trail and requires explicit Resume; closing it does not restart movement. The short mobile picker keeps its close button reachable and its contents scrollable.
- Release uses a normal GitHub PR merge and native publication of the synced source. The PR records the exact merged commit, CI results and final live-site smoke check. No generated build assets or temporary viewport harness are committed.

These are browser viewport and keyboard checks. Physical iOS/Android device and OS-specific behaviour has not been certified by this pass.
