# KDS ticket layout and readability — 7 November 2026

## Requested outcome and confirmed cause

The owner requested a more readable desktop/mobile KDS when long and short orders appear together, with spacing between food, add-ons and notes and no change to existing order functionality.

The existing ticket grid uses ordinary one/two/three/four-column CSS Grid rows. `align-items: start` keeps a short ticket at its natural height, but the row still takes the height of its tallest neighbour. The next row therefore starts below the long ticket and leaves unused space under shorter orders. A single selected stage and Done history share the same layout. Narrow standalone screens intentionally use one full-width column, so removing desktop row gaps alone cannot improve navigation on a phone.

## Changes

- `KdsTicketGrid` keeps the existing keyed cards as direct children of one grid. Native observers measure their natural heights and apply sparse CSS row spans. Short tickets can occupy space beneath shorter neighbours without splitting, truncating or hiding an order. The sorted order array and each card's React parent remain stable.
- Only grids with multiple columns use measured placement. Single-column phones retain ordinary full-height tickets. Missing observer support or invalid measurement retains the ordinary usable grid. Large queues use a coarser row unit instead of creating an excessive number of implicit tracks.
- A compact sticky **Jump to order** selector lists exactly the orders in the current filtered view, with their current stage and purchased quantity. Selecting one scrolls to and focuses its existing card. It neither selects a status nor changes the queue, filter, order or receipt. The same shortcut is available for read-only Done history.
- Food lines have a clearer divider and more separation. Modifiers have larger gaps, meal contents use 14px text, secondary choice details use 12px text, and order/item notes retain labelled highlighted panels. Main item names remain 16px; modifiers remain 14px; readiness and action targets remain at least 44px.
- Ticket and control scroll offsets allow space for the sticky navigator and the phone's top safe area. Existing stage lanes, stage filters, search, sort and mobile bottom navigation remain available.

No changes were made to canonical order data, sorting/filtering rules, polling, permissions, authentication, RPCs, payment authority, item-ready rules, acceptance, sealing, handover validation, alerts or print queueing. Each complete master order still appears once. The entered collection code remains local to the same existing card component; layout code does not reparent or virtualize it.

Long individual orders still require reading and scrolling through their contents. This change addresses unused space between orders and the need to scroll through intervening tickets to reach another order; it does not promise that arbitrary full-detail orders fit on one screen.

## Competitor evidence and decisions

The following primary sources were reviewed on 7 November 2026. They inform the design choices; they do not establish that those products use MealDeck's measured-grid implementation.

| Source                                                                                                                                | Relevant documented behaviour                                                                                                                                              | Decision                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Lightspeed KDS 2.0](https://k-series-support.lightspeedhq.com/hc/en-us/articles/22708154090267-Using-the-Kitchen-Display-System-2-0) | Direct line view retains full tickets but may leave empty space. Equal view uses equal cells and may truncate details. A condensed header retains the same summary fields. | Recover unused space while retaining full food and note details.                                             |
| [Tebi restaurant KDS](https://help.tebi.com/en/articles/775925-set-up-kds-for-your-restaurant)                                        | Controls ticket text, product spacing and header size separately. Recommends large item text for courses/modifiers, with a smaller header.                                 | Improve spacing and layout without reducing primary text.                                                    |
| [Loyverse KDS](https://help.loyverse.com/help/kitchen-display-system)                                                                 | Shows modifiers/comments beneath their item; long tickets can continue in multiple pieces.                                                                                 | Preserve the existing item/detail hierarchy. Ticket splitting is outside this change.                        |
| [BLogic long tickets](https://helpdesk.blogicsystems.com/2026/09/29/how-to-split-long-tickets-across-columns-on-kds/)                 | Dynamic layout can continue a ticket into another column/page while Fulfill and Recall retain their shared ticket behaviour.                                               | Useful precedent for separating presentation from order state. Keep MealDeck's current single complete card. |

## GitHub and MCP review

- [react-masonry-css](https://github.com/paulcollett/react-masonry-css) is a small MIT-licensed responsive-column component. Its documentation does not promise height balancing, and its separate React column parents are unsuitable for preserving an interactive card's local input through queue changes without additional work.
- [Masonic](https://github.com/jaredLunde/masonic) offers autosizing and virtualization. The current need is unused space, not a huge virtualized feed; offscreen unmounting would add focus and input-state risks.
- [Masonry](https://github.com/desandro/masonry) is a useful variable-height positioning reference, but another imperative layout dependency is unnecessary for this bounded change.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) and [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) are useful development/browser-verification tools. They do not need to run inside the KDS. Neither MCP was installed for this change; the existing GitHub connector was used for repository work.

[MDN's grid accessibility guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Accessibility) explains why visual reordering can diverge from keyboard and reading order. The implementation uses ordinary sparse placement, no `dense`, no height sorting and no decorative movement animation.

No third-party runtime package or copied competitor implementation was added.

## Verification and remaining acceptance

- Existing KDS suites: **88 tests passed, 589 assertions**, across view, toolbar, presentation, workflow, canonical parsing, readiness and outbox tests.
- Full application TypeScript and scoped ESLint passed after integration.
- Production build passed, with the fixture excluded from public output.
- The isolated synthetic fixture also passes strict TypeScript checks. It contains eight active mixed-length orders, three Done cards, long modifiers/notes, attached extras, named bags, kerbside details, and a collection-code input for state-preservation checks.
- The local browser verification attempt was blocked by automatic approval review for the localhost preview. No visual geometry, mobile browser, focus-retention or screenshot acceptance is claimed. The source remains reviewable while that browser approval is resolved.
- Fixture sources are retained under `tests/fixtures/kds-layout/`. They are outside `public` and production routes. Application fetch/XHR calls are refused in the fixture. Its README gives the temporary preview setup and cleanup commands.

Before final release, use the approved synthetic preview to check 320px, 390px, 768px and desktop widths; mixed short/long geometry without overlaps; all modifiers and final notes; sticky order-jump positioning; collection-code value and focus through resizing/another order's removal; sealing/Back/Escape; current stage lanes; read-only Done; and normal fallback. Verify the keyboard/mobile bottom-bar interaction. No live order needs to be mutated for this acceptance.
