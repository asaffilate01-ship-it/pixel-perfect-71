# MealDeck arcade expansion and mobile popup review

Date: 7 November 2026  
Status: source implementation and local review; release verification and publication pending.

## Scope and product decisions

The owner requested a review of mealdeck.co.uk, its repository, relevant MCP tools and GitHub projects, improvements to game features and flow, more games, and fixes for mobile popup cards. This change expands the existing eleven-game library to **fourteen games** and repairs shared overlay behaviour.

Games remain free, account-free entertainment. Game outcomes have no authority over orders, payments, prices, loyalty points, discounts or food. Existing approved MealDeck artwork and the cream, paper, ink and red visual language remain the source of truth. The October [premium-games record](mealdeck-play-premium-games.md) is historical; this document records the current expansion.

## Games and discovery

| New game     | Play and controls                                                                                                                                                                                     | Replay options                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sauce Switch | Clear a tray by toggling a tile and its orthogonal neighbours; 3 × 3 and 4 × 4 boards, keyboard controls, undo and hints. Generated starting boards are solvable.                                     | Fresh puzzles, restart the same layout, or a daily puzzle seeded by UTC date and board size. |
| Menu Quest   | Find food words by selecting their first and last letters. Endpoint selection avoids requiring a continuous drag; keyboard navigation, hints and a larger-letter board support different input needs. | Fresh and daily UTC puzzles.                                                                 |
| Tray Tactics | A 6 × 6 capture-and-flip strategy board inspired by Reversi. Place food tokens to bracket an opponent's line.                                                                                         | Play against the local chef or share one device with another player.                         |

The eleven retained games are Food Pairs, Recipe Rush, Kitchen Chaos, Brand Snap, Go Dish!, Full House, Kitchen Stacks, Feast 2048, Four to Feast, Order Echo and Kitchen Shuffle. Feast 2048 already existed, so another 2048 implementation would add little variety.

The library combines text search, the existing category filter, and five collections: **All games**, **New on the menu**, **My favourites**, **Play with a friend**, and **Daily puzzles**. Changing a filter preserves the current round; choosing another game starts that game's fresh playing area. The three additions populate the new collection, Four to Feast and Tray Tactics populate shared-device play, and Kitchen Shuffle joins Sauce Switch and Menu Quest in daily puzzles.

Favourites store only validated catalogue identifiers on the current device. Storage failures leave the library usable and produce truthful per-visit feedback. Copy game link creates an allowlisted `/play?game=…` URL; Food Pairs may also include its approved brand skin. A link opens a fresh round and does not contain customer data or a saved board. A selectable text fallback supports browsers where clipboard access fails.

Implementation is kept in the existing React application, with pure game rules, deterministic daily generation and separately loaded game panels. Relevant sources are `src/lib/mealdeck-arcade-library.ts`, `src/lib/mealdeck-puzzle-games.ts`, `src/lib/tray-tactics.ts`, the panels under `src/components/play/`, and `src/routes/play.tsx`.

## Mobile popup repairs

The review found concrete layout and interaction defects: the shared Sheet content could sit beneath its own backdrop; default dialogs lacked a viewport height limit; mobile bottom-sheet overrides cancelled `transform` without cancelling Tailwind's independent `translate`; and nested menu steps could lose the customer's scroll position or move focus unexpectedly.

- Shared Dialog and Sheet primitives now have consistent foreground layering, bounded dynamic-viewport height, contained scrolling, readable foreground colours, 44px close controls and reduced-motion handling. The close surface inherits the actual popup background so cream menu cards remain coherent under the site's dark root theme.
- Menu customisers reset both translation variables and the independent `translate` property when becoming mobile bottom sheets. Safe-area spacing and wrapping protect narrow screens. Normal-height screens have one scrolling body; very short screens scroll the content wrapper so choices and actions remain reachable while Close stays available.
- Moving into a Load'd or Moktl upgrade and returning restores the previous scroll position and the offer control's focus without an unwanted jump. Changing the main customiser step starts its content at the top.
- The Brands/More sheet has a dedicated scrolling content wrapper with its close control outside that wrapper. Initial focus goes to the heading; dismissal retains the existing return-focus behaviour.
- The arcade game picker has its own bounded scrolling area, explicit translation reset, heading autofocus and scoped visual-viewport adjustment while open. This avoids opening the software keyboard merely by opening the picker; text search remains available when selected.
- Mobile arcade inputs and selects use 16px text. Focus view removes the site header, footer and floating navigation, with a compact sticky Games/Exit control so the board remains usable. Game-local error handling keeps the library available if a game chunk fails to load.

The shared changes are in `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`, the launch item customiser and app navigation components, `src/styles.launch-customiser.css`, and `src/styles.launch-app.css`. Arcade-specific presentation remains in `src/routes/play.tsx` and `src/styles.mealdeck-arcade-shell.css`. Menu selection, canonical pricing, availability, authentication and checkout authority retain their existing implementation.

## Primary repository research and adoption decisions

The following seven primary repositories and their published licence files were checked on 7 November 2026. These are focused implementation and tooling references, not a claim to have audited their full codebases. No package dependency, MCP connection or third-party implementation was added by this research.

| Primary repository                                                                                 | Published licence                                                           | Decision for MealDeck                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)                            | [Apache-2.0](https://github.com/microsoft/playwright-mcp/blob/main/LICENSE) | Useful development tooling for repeatable browser interaction, accessibility-tree inspection, screenshots and viewport checks. Keep outside the customer bundle. Existing browser tooling can perform the current review; a new connection is optional. |
| [GitHub MCP Server](https://github.com/github/github-mcp-server)                                   | [MIT](https://github.com/github/github-mcp-server/blob/main/LICENSE)        | Useful for repository, issue, PR and CI context. Prefer the smallest relevant toolset and read-only access for research. It is a developer integration, not a game feature or browser dependency.                                                       |
| [Deque axe-core-npm](https://github.com/dequelabs/axe-core-npm), especially `@axe-core/playwright` | [MPL-2.0](https://github.com/dequelabs/axe-core-npm/blob/develop/LICENSE)   | Recommended future automated accessibility QA alongside keyboard and visual checks. Review the selected package's Node compatibility before adding it. Keep it in test tooling and retain applicable notices; no axe scan is claimed for this change.   |
| [Gabriele Cirulli's 2048](https://github.com/gabrielecirulli/2048)                                 | [MIT](https://github.com/gabrielecirulli/2048/blob/master/LICENSE.txt)      | Reference for a small standalone puzzle and mobile input considerations. MealDeck already has Feast 2048, so retain the existing implementation and add distinct mechanics. No source was copied.                                                       |
| [Motion](https://github.com/motiondivision/motion)                                                 | [MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md)        | Its reduced-motion guidance is useful. Existing CSS is sufficient for this expansion; adding an animation runtime is unnecessary. The open-source library licence does not imply access to separate Motion+ content.                                    |
| [use-gesture](https://github.com/pmndrs/use-gesture)                                               | [MIT](https://github.com/pmndrs/use-gesture/blob/main/LICENSE)              | Consider only if a future game needs complex gestures. Current tap and keyboard controls avoid drag-only interactions and page-scroll conflicts without another dependency.                                                                             |
| [Phaser](https://github.com/phaserjs/phaser)                                                       | [MIT](https://github.com/phaserjs/phaser/blob/master/LICENSE.md)            | A candidate for a future action or physics game. A Canvas/WebGL engine would add integration and accessibility work to these small DOM puzzles, so it is deferred.                                                                                      |

Supporting primary guidance: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) explains the limits of automated checks; [Motion accessibility](https://motion.dev/docs/react-accessibility) covers reduced motion; [use-gesture gesture guidance](https://use-gesture.netlify.app/docs/gestures/) discusses touch and scrolling; [React reducer guidance](https://react.dev/reference/react/useReducer) supports isolated, pure state transitions. The decision is to improve development feedback and keep the shipped game rules small and testable.

## Verification observed so far

The following checks were performed in a local browser preview with constrained CSS viewports. They establish local layout and interaction evidence; they are not physical-phone or live-production acceptance.

| Surface           | Viewport or scenario           | Observed check                                                                                                                                                   |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Burger customiser | 320px wide                     | Narrow layout and available popup controls.                                                                                                                      |
| Meal upgrades     | Load'd nested popup, then Back | Upgrade renders; previous scroll position and offer focus return.                                                                                                |
| Brands picker     | 320px and 390px wide           | Geometry, visual layout and focus return.                                                                                                                        |
| Menu More sheet   | 640 × 360                      | Content scrolls and Close remains available.                                                                                                                     |
| Plain Pepsi       | 390px wide                     | Compact single-product popup layout.                                                                                                                             |
| Portion selection | 768px and 1280px wide          | Responsive layout; desktop dialog measured 600 × 720.                                                                                                            |
| Basket            | 390 × 400                      | Short-height scrolling and visible 44px close control.                                                                                                           |
| Game picker       | 390 × 400 and 320px wide       | Search and collections scroll within the viewport; heading autofocus, 16px form text, favourites, share feedback and two-player filtering work.                  |
| Sauce Switch      | 320px wide                     | Keyboard navigation, move/undo, hints and complete-round focus verified.                                                                                         |
| Menu Quest        | 320px and 390px wide           | Daily puzzle reproduced after restart; all six words completed using endpoints. Larger letters measured 45.25px with horizontal scrolling confined to the board. |
| Tray Tactics      | 320px and 1280px wide          | Chef reply, complete-turn undo, full game with forced passes, Play again focus, and alternating local-player turns verified. No page-level horizontal overflow.  |

The local runtime lacked public-menu backend configuration, so ordinary menu item buttons correctly remained unavailable. A temporary, clearly labelled **UI test only** fixture rendered the real customiser and basket components against the approved static catalogue with queries disabled. It used local fixture state and no checkout or purchase action; application availability gates were not bypassed or changed. The fixture files `public/__popup-qa.html`, `verification/popup-qa.tsx`, and the viewport harness `public/__mealdeck-viewport.html` were removed before the release build.

Scoped formatting, lint for the four changed popup TSX components, and `git diff --check` passed during implementation. These checks do not replace the integrated results below.

## Integrated source acceptance

The existing main-branch updates were merged normally, preserving the runtime-gated WhatsApp link and revised opening hours. The following results describe this integrated source. GitHub checks and publication are separate release steps and are recorded with the associated pull request.

| Gate                                             | Final result                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Game and menu regression suites                  | 54 game tests / 11,235 assertions and 87 menu tests / 2,223 assertions passed.                                                   |
| TypeScript, production build and integrated lint | `tsc --noEmit`, `bun run build`, and scoped ESLint for all changed TS/TSX files passed after merging main.                       |
| New-game browser acceptance and keyboard checks  | All three games exercised as recorded above. Reduced-motion CSS reviewed; physical devices and OS keyboard behaviour not tested. |
| Temporary QA files removed                       | All three temporary paths above removed.                                                                                         |

The production build emits separate on-demand game modules: the puzzle module is 6.57 kB gzipped JavaScript and Tray Tactics is 4.36 kB gzipped JavaScript (CSS 1.65 kB and 1.41 kB respectively). These are build outputs for this revision, not network timing measurements. No new runtime dependency was added. The workflow now includes the new rules and discovery tests, new game modules, and shared popup primitives in the existing verification gates.
