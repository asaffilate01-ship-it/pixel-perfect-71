# MealDeck Play sharing phase — 7 November 2026

## Purpose and delivered behavior

Give visitors a clear way to invite a friend, share a finished round and return for a daily puzzle. The first phase uses the existing free, account-free arcade and optional local playbook. It adds no package dependencies or backend services.

- Every one of the 19 catalogue games has a Share action with an invitation and a canonical game link.
- Supported devices can open their native text/link share sheet. Copy message, Copy game link and a recipient-neutral WhatsApp link provide alternatives. The player selects the destination and sends from their own app.
- A locally generated 1200 × 1200 PNG uses the complete approved MealDeck logo, approved game food artwork, invitation/result, website address and free/no-sign-in wording. Players can download it or share the picture when the browser supports file sharing. A picture and its clickable link are separate sharing options.
- The eight tracked games expose result sharing from recent playbook rounds and a clearly labelled latest-result action below the current game. Public details include validated outcomes, moves, hints and Snack Trail food counts, with appropriate singular/plural wording and no fabricated rankings or prizes.
- The hero has a Daily puzzle action. The playbook offers dated invitations for Sauce Switch, Menu Quest and Bento Sudoku.
- Sauce Switch and Bento Sudoku result links preserve the recorded UTC date and recognized board size. Menu Quest uses its fixed daily size. Legacy records without a recognized size retain their result summary but use a generic invitation rather than claiming to reproduce the same puzzle.

## Mobile and accessibility behavior

The share dialog becomes a bottom sheet on phones, keeps its heading and 44px close button outside the scrolling content and adapts to the visual viewport. Main actions have 48px targets. The card and actions occupy their full content height, preventing overlapping grid rows when a short viewport requires scrolling. Textareas use 16px text.

The heading receives initial focus without opening a keyboard. Dismissal returns focus to the actual clicked Share button, including pointer activation that does not focus buttons. Snack Trail and Order Echo receive the existing interruption signal when sharing opens; closing the sheet never resumes their timers automatically. Reduced-motion preferences are respected.

## Data and platform boundaries

Sharing revalidates completion records and explicitly builds public text. Storage IDs, completion timestamps, private or unknown fields, board contents and solutions are not included. A round's recorded date is used even if the surrounding page represents another date. Generated files stay in the browser until the player chooses a sharing or download action. Rendering is abortable; temporary object URLs are revoked on close.

Native sharing requires a direct user interaction. The PNG is prepared in advance so image generation does not consume that interaction. A native handoff is not proof that a post was published; cancellation is quiet, and copy/download remain available. WhatsApp opens an app-selected recipient flow, separate from MealDeck's gated business-ordering channel.

This phase does not send social posts, promotional notifications or messages, activate rewards, introduce public leaderboards, change global SEO canonical rules or add customer behavioral analytics. Downloadable result cards do not change the generic automatic social-link preview for `/play`.

## Validation

- Full game suite: **181 passing tests, 0 failures, 57,143 assertions across 15 files**. Sharing cases cover all catalogue invitations, all tracked result types, malformed inputs, unknown fields, bounded metrics, UTC dates, supported sizes, old link compatibility, recipient-neutral WhatsApp encoding, bounded text layout and uncropped artwork sizing.
- TypeScript and scoped ESLint checks run for changed game modules. The sharing suites are included in the existing Verify workflow.
- Production build completed successfully after integrating the current `main`, including the concurrent reviewed KDS changes. Preview-only viewport fixtures were removed before the build.
- Browser checks at 320px, 390px, 768px and desktop widths, plus a 390 × 400 short viewport. No horizontal overflow in the reviewed dialog or narrow playbook. The short sheet retains its visible close control while card, actions and message scroll internally.
- Completed a daily 6 × 6 Bento Sudoku through visible hint controls: result reported 20 moves and 20 hints, with `daily=2026-11-07&size=6` in its shared link. Verified a dated 4 × 4 Sauce Switch link opens the correct setup and still requires an explicit Start.
- Downloaded a real result card through the browser: PNG, 1200 × 1200, 193,256 bytes. Checked the rendered invitation and result cards, message/link content, return focus, daily invitation buttons and deliberate resume for both interruptible games.
- The cloud browser does not expose a phone's native share sheet. Native app destination selection, individual social app behavior and physical mobile keyboard/safe-area behavior remain device-specific checks; capability detection and fallback paths are implemented. Embedded-frame blob download inspection is unsupported by the browser tool, so the download was verified in a top-level app tab.

## Recommended growth use after release

1. Run a regular “Today's MealDeck challenge” post using a dated daily invitation. Ask people to share their own result and invite a friend to the same puzzle. Publish campaigns manually through the approved brand account workflow.
2. Use short screen recordings of Snack Trail, Skewer Sort and Pantry Sweep to demonstrate the games, with the relevant game link in the available profile/post link location.
3. Put a stable `/play` QR link on approved receipt, packaging and table material, with a plain call to action such as “Got a minute? Play MealDeck.” Printed material should not use a date that becomes stale.
4. Keep the route from a game to menus clear. Evaluate qualified local visitors and menu/order behavior as well as game plays; entertainment traffic alone does not establish business value.
5. A later measurement phase should distinguish visits, starts, completions, share actions, referred visits, menu visits and completed orders. A share click is not a confirmed external post. Agree attribution, consent and retention before adding tracking.

Dedicated public game landing pages with accurate per-game social previews, campaign measurement and optional return reminders are future work. No traffic or conversion uplift is assumed by this release.

## Primary platform references

- W3C Web Share Recommendation: <https://www.w3.org/TR/web-share/>
- WhatsApp click-to-chat guidance: <https://faq.whatsapp.com/5913398998672934>
- Open Graph protocol: <https://ogp.me/>
