# KDS ticket layout, readability and mobile vibration — 7 November 2026

## Requested outcome and confirmed cause

The owner requested a more readable desktop/mobile KDS when long and short orders appear together, with spacing between food, add-ons and notes and no change to existing order functionality.

The existing ticket grid uses ordinary one/two/three/four-column CSS Grid rows. `align-items: start` keeps a short ticket at its natural height, but the row still takes the height of its tallest neighbour. The next row therefore starts below the long ticket and leaves unused space under shorter orders. A single selected stage and Done history share the same layout. Narrow standalone screens intentionally use one full-width column, so removing desktop row gaps alone cannot improve navigation on a phone.

## Changes

- `KdsTicketGrid` keeps the existing keyed cards as direct children of one grid. Native observers measure their natural heights and apply sparse CSS row spans. Short tickets can occupy space beneath shorter neighbours without splitting, truncating or hiding an order. The sorted order array and each card's React parent remain stable.
- Only grids with multiple columns use measured placement. Single-column phones retain ordinary full-height tickets. Missing observer support or invalid measurement retains the ordinary usable grid. Large queues use a coarser row unit instead of creating an excessive number of implicit tracks.
- A compact sticky **Jump to order** selector lists exactly the orders in the current filtered view, with their current stage and purchased quantity. Selecting one scrolls to and focuses its existing card. It neither selects a status nor changes the queue, filter, order or receipt. The same shortcut is available for read-only Done history.
- Food lines have a clearer divider and more separation. Modifiers have larger gaps, meal contents use 14px text, secondary choice details use 12px text, and order/item notes retain labelled highlighted panels. Main item names remain 16px; modifiers remain 14px; readiness and action targets remain at least 44px.
- Ticket and control scroll offsets allow space for the sticky navigator and the phone's top safe area. Existing stage lanes, stage filters, search, sort and mobile bottom navigation remain available.
- At 360px and below, the order-shortcut label sits above its full-width selector, with a matching larger scroll offset. Ticket cards establish a positioning context so visually hidden time labels remain inside their horizontally scrolling stage lane.

No changes were made to canonical order data, sorting/filtering rules, polling, permissions, authentication, RPCs, payment authority, item-ready rules, acceptance, sealing, handover validation or print queueing. Each complete master order still appears once. The entered collection code remains local to the same existing card component; layout code does not reparent or virtualize it. The owner's subsequent mobile-vibration request adds an optional KDS alert channel; existing sound and visual alerts remain available.

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

## Optional mobile vibration

The owner subsequently requested vibration for mobile KDS alerts. **Tools** now
offers **Enable vibration**, **Disable vibration** and **Test vibration** when
the browser exposes the Vibration API. The device-local preference defaults off
and is separate from the existing sound/volume setting. Enabling it gives an
immediate short sample; fresh eligible order arrivals use two 120ms pulses with
an 80ms gap. Muted or zero-volume sound does not disable vibration.

The controller requires the enabled preference, a visible document and prior
trusted/browser user activation. It has no backlog or repeating timer, guards
overlapping samples, and cancels on hiding, disabling and disposal. The existing
fresh-order ledger still seeds the initial feed silently and deduplicates polls,
reconnections and repeated IDs. Both channels share the existing optional
cross-window lock and claim. Vibration eligibility is captured at arrival and
rechecked at dispatch; enabling/unlocking/showing a page cannot revive an older
arrival. Scope/controller identity prevents a delayed callback from targeting a
replacement kitchen context.

Unsupported, rejected or throwing vibration calls cannot suppress sound or
visual notices. Printer instances do not create a vibration controller or show
vibration controls. Only a boolean device preference is persisted; no order IDs
or customer information are added to storage. The sound waveform, volume policy,
readiness rules, acceptance, packing, handover and receipt paths are unchanged.

The [W3C implementation report](https://w3c.github.io/vibration/reports/implementation.html)
identifies functional implementation in Blink/Chromium browsers and no Safari
implementation. The [Vibration API specification](https://w3c.github.io/vibration/)
requires visibility and sticky activation and allows device/browser rejection.
The [Chrome activation guidance](https://developer.chrome.com/blog/user-activation)
explains that a previous interaction can permit later callbacks. These sources
were checked on 7 November 2026. A successful API return is not physical-device
evidence; this feature does not promise iPhone vibration, lock-screen delivery,
or a pulse in every tab when another tab claims the shared alert.

## Observed browser verification

After the owner approved local preview access, the supported managed browser
loaded the synthetic fixture and completed these checks. All order interactions
below were local fixture callbacks, not real kitchen mutations.

| Check                                          | Observed result                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tickets at 320, 390, 768, 1280 and 1600 CSS px | No card overlaps or page-width overflow; one-column standalone mobile and three/four-column desktop layouts.                                                                                                                          |
| Mixed-length desktop comparison at 1600px      | The same eight-card fixture occupied 5,360px with packing versus 6,275.78px with legacy rows, about 916px less. This is a fixture result, not a general reduction guarantee.                                                          |
| Partial collection code                        | `24` remained in order 9102 through repeated viewport changes and removal of earlier order 9101.                                                                                                                                      |
| Order shortcut                                 | Focus moved to the chosen existing card, with its top about 84px below the viewport top and beneath the 60px sticky shortcut. Read-only Done shortcuts also worked.                                                                   |
| Order actions                                  | Accept, start preparing and per-item readiness produced their original expected callback arguments. Packing Back and Escape cancelled; confirmation exposed the handover input. Synthetic code `2468` completed the fixture handover. |
| Done history                                   | Four displayed completed cards had no mutation buttons or readiness checkboxes.                                                                                                                                                       |
| Selected stage                                 | The Preparing lane rendered three columns at 1280px.                                                                                                                                                                                  |
| All-stage phone view                           | Its lanes scrolled horizontally, but a hidden absolute `Released at` label in a later lane contributed to root overflow. Source correction adds `position: relative` to each card; re-verification is outstanding.                    |

The preview's public fixture entry did not pick up the subsequent CSS edit
through hot reload. A normal supported browser reload was then rejected by
automatic security review with an origin/URL-protocol policy error, despite the
previously approved HTTP preview being accessible. Browser attempts stopped;
no alternate browser, raw CDP or shell-browser route was used. The last narrow
shortcut/hidden-label adjustments and newly added vibration controls therefore
have **not** received final rendered-browser acceptance in this environment.

## Automated verification and remaining acceptance

- Combined final local suite: **173 tests passed, 1,177 assertions**, across KDS view/toolbar/presentation/workflow/parsing/readiness/outbox, existing sound/ledger, printer/acceptance, and new vibration/channel/control tests.
- New tests cover rejected/throwing or absent vibration, independent muted sound, native touch activation changing after pointerdown, cancellation, delayed-arrival invalidation, unsupported UI fallback and printer exclusion.
- Full application TypeScript and scoped ESLint passed after integration.
- Production build passed, with the fixture excluded from public output.
- The isolated synthetic fixture also passes strict TypeScript checks. It contains eight active mixed-length orders, three Done cards, long modifiers/notes, attached extras, named bags, kerbside details, and a collection-code input for state-preservation checks.
- The original layout commit's GitHub workflows all completed successfully: Verify MealDeck (push and pull request), Verify KDS six-stage workflow, and Verify WhatsApp guest checkout.
- Fixture sources are retained under `tests/fixtures/kds-layout/`. They are outside `public` and production routes. Application fetch/XHR calls are refused in the fixture. Its README gives the temporary preview setup and cleanup commands.

Remaining manual acceptance is the final narrow-screen shortcut and stage-scroll
fix, the new vibration controls, enlarged-text reflow, and a real mobile keyboard
with the bottom navigation. Physical vibration can only be confirmed on a
supported phone. The desktop responsive fixture is not a physical phone test.
No live order needs to be mutated for any of these checks.
