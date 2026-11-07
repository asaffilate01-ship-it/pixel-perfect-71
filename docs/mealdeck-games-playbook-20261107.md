# MealDeck games: playbook phase

Date: 7 November 2026

## Purpose

The owner requested the next game phases after the fourteen-game arcade and mobile popup release. This phase adds two distinct games and a small device-local playbook, preserving the existing food artwork, free play and account-free experience.

## New games

- **Bento Sudoku**: four- and six-symbol number/food puzzles with fresh and daily UTC boards, fixed clues, hints, erase and undo. Boards must have exactly one solution. Keyboard navigation and a number keypad support tap and keyboard play.
- **Tray Lines**: a three-by-three Dots and Boxes board against the chef or a second local player. Completing a box keeps the turn; scores and the next player remain explicit. Undo restores a complete local move or a solo turn including the chef's replies.

Both modules load on demand. They use original local rules and the existing React/CSS stack; no runtime library or copied third-party implementation is required. All fourteen earlier games remain available.

## Discovery and daily play

The New collection highlights the two additions. Tray Lines joins the shared-device collection, and Bento Sudoku joins daily puzzles. “Pick for me” chooses within the current search/category/collection, preferring a different game when one exists.

The playbook includes today's three tracked puzzles: Sauce Switch, Menu Quest and Bento Sudoku. Choosing one opens a public, strictly validated game/date URL. The date is frozen in that link and in the started round; another day's puzzle is an explicit choice. Ordinary Copy game links still open fresh game setup and contain no local history.

## Device-local playbook

The playbook records actual completed rounds in Sauce Switch, Menu Quest, Tray Tactics, Bento Sudoku and Tray Lines. Other games retain their existing score behaviour and are not presented as tracked. This is finished-round history, not board autosave or cross-device sync.

Records are versioned, bounded and validated. Stable round identifiers prevent duplicate completion effects and undo/re-completion from counting the same round twice. Device storage is optional: if it fails, play remains available and the interface describes session-only progress. Clearing the playbook requires an explicit confirmation within the game interface and leaves favourites separate.

History and completion counts have no authority over customer identity, food, money, loyalty points, discounts, orders or payment. No account, backend or notification permission is needed.

## Acceptance

- The complete arcade regression command passes **103 tests and 16,687 assertions** across ten files. The CI game regression and scoped lint steps include the new modules.
- Strict project TypeScript, scoped ESLint, `git diff --check` and the production build pass. The source includes the concurrent mobile-notifications main branch changes without altering them.
- Responsive browser checks cover 320px and 390px phone widths, a 390×400 short viewport, 768px tablet width and 1280px desktop width. The checked pages have no document-level horizontal overflow. At 320px, six-column Sudoku retains 44px cells and confines horizontal scrolling to the board.
- Browser playthroughs confirm daily Bento completion, keyboard entry, Undo, counted hints, clear confirmation, persistence after reload, same-day replay and frozen daily dates. Sauce Switch completion advances the daily checklist. A complete Clever Tray Lines match, whole-turn Undo, re-completion deduplication and local-player turn changes pass.
- Opening the picker, filtering and returning to the same game preserve the current turn. Focus view preserves it too. Pick for me chooses the other game within the two-game New collection. The short-viewport picker fits vertically, scrolls internally and returns focus after Escape.
- Physical iPhone/Android hardware, OS keyboards and assistive-technology combinations have not been exercised by these responsive browser checks. The playbook stores completed rounds only; leaving or reloading still resets an unfinished board.

The pull request records the hosted verification and publication result separately from these local checks.
