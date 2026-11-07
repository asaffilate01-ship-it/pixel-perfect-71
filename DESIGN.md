# MealDeck design system (current-source reference)

This document records MealDeck's own committed visual language. It is not a copy of a design-system sample. See `src/styles.css` and `src/styles.mealdeck-rebuild.css` for authoritative values.

## Audience and product idea

People ordering food for different cravings should feel the pleasure of choosing **many brands from one kitchen**, with one basket and one handoff. The MealDeck card/deck motif and real food photography distinguish the brand. The ordering screen is an **Operate** surface; the homepage and franchise pages are **Persuade** surfaces.

## Established visual identity

- Marketing: MealDeck red `#d5141d`, deep red `#951018`, black `#111111`, warm cream `#fff6e8`, paper `#fffdf7`, yellow `#ffd51f` and gold `#e7b53a`. The CSS variables, not these examples, remain the source of truth.
- App: legacy surfaces retain semantic light/dark tokens in OKLCH. The current root shell forces a dark initial appearance. Launch menus, customer tracking and staff operations use explicitly scoped MealDeck cream/paper surfaces and ink text; their overlays and controls must use the same scope rather than mixing paper surfaces with dark-theme text.
- Typography: Outfit for display, DM Sans for controls and content, Caveat only where the existing brand script treatment calls for it.
- Imagery: use the repository's approved brand and dish assets. When a generic/category image represents a *sample* menu item, label it **illustrative**. Never show an illustrative image as an exact product photograph.
- Surfaces: readable dish details, clear interactive target areas and restrained depth. Do not layer generic icon cards or rainbow glows onto the card/food identity.

## Experience priorities

1. First-screen hierarchy: postcode/location state, fulfilment, browse, basket and readiness should be instantly understandable.
2. Multi-brand continuity: switching between available brands must not discard the current basket for the same kitchen. Location changes have their own reset rules.
3. Inclusive design: semantic headings and landmarks, visible keyboard focus, adequate contrast, descriptive controls, reduced-motion alternatives, 44px touch targets where possible, and overflow checks at narrow widths.
4. Truthful status: *sample*, *illustrative*, *coming soon*, *unavailable*, *pending payment*, *paid* and *completed* are distinct states. Do not use paid/success visuals without server-confirmed evidence.
5. Small screens: single-column dish cards, practical search controls and basket panels that preserve checkout readability. Provide real error, zero-result, unavailable and pending states.
6. Chat commerce: offer only a clearly labelled enquiry/assistant handoff after an official location-specific number has passed production verification. WhatsApp is not the payment processor.

## External design references

Taste Skill guides subject-specific composition, Impeccable guides accessibility and interaction finishing, and Awesome DESIGN.md is a **reference catalogue**. Use these as review methods, never to overwrite MealDeck's identity or copy another company's design assets.

## Review protocol

Inspect existing pages and CSS before changes. Run build, tests, lint and a keyboard/mobile browser pass (320px, 390px, 768px, desktop). If actual screenshots or live runtime verification are unavailable, record that limitation rather than claiming pixel-perfect validation.

## Group ordering rooms — 6 November 2026

- Present one room with clear people, food and payment status. The organiser creates it; invitees accept and join; each person edits their own dishes and marks them ready. Use the current room snapshot for saving, conflicts and progress. Keep reply-link generation, pasted replies and message threads out of this flow.
- Show the server's three-minute join deadline and distinguish **Invited**, **Joined**, **Ready**, **Payment processing** and **Paid** in text as well as colour. Explain when an unaccepted invitation expires. Joined people do not disappear when the invitation timer reaches zero.
- Give the organiser one complete final review after everyone remaining is ready. Make the person, quantity, every flavour/extra and eventual exact bill easy to inspect. Once the room is frozen, show that food choices are locked; do not offer edits that would change another person's promised amount.
- The new room has two payment choices: **Everyone pays for their own food** and **I’ll pay for everyone**. Keep per-person itemisation in both modes. Equal split belongs to historical payment records, not the new room controls. A return from a payment page is **checking payment** until the server verifies it.
- Carry the same short name and numbered bag label from review into the kitchen and receipts, such as **Amer · Bag 1**. Repeat the label beside each relevant food line, keeping all choices and attached extras visible. The bag number distinguishes duplicate names and remains the fallback for historical unnamed orders.
- Keep a single complete kitchen order card and the existing staff acceptance, preparation, packing and handoff stages. Partial funding does not appear as separate meals ready for kitchen work. Use the existing cream/paper surfaces, ink text, brand red, readable wrapping, 44px controls and restored focus at narrow widths.

## Earlier group previews and cuisine discovery — 3 November 2026

Historical preview guidance follows. The current room interaction and two payment choices above supersede the earlier equal-share preview UI; the penny-allocation and evidence rules still apply to historical records.

- Filter sample menus by semantic food category *and* brand, with a visible count and one-touch reset; do not imply product availability.
- Keep the primary brand and food photography hierarchy ahead of feature widgets. Use established brand red, paper, black, accessible focus and 44px controls rather than new visual gradients.
- Equal share previews distribute integer pennies exactly (and delivery is a **single** order-level charge, omitted until quoted). Never round every share up or imply a payment has been collected.
- Back-office exception cards are read-only operational prompts. A late-looking order is **not** proof of a failed kitchen or courier. Operations remains a protected, distinct UI mode.
- Model-generated text must never be exposed as confirmed price, allergen assurance, payment completion, availability, fulfilment or refund.

## Shared app experience — 4 November 2026

- Staff operations and the shared kitchen display use the approved MealDeck logo, compact black header, warm cream canvas, paper cards and red primary actions. Keep meaningful kitchen state colours and text labels; brand colours must not replace operational meaning.
- The launch menus own one four-action mobile bar: Menus, Brands, Basket and More. The basket stays prominent, with its actual saved quantity. Brand changes preserve choices. All five approved launch logos remain available in the brand sheet and menu header.
- At widths up to 800px, use bottom sheets with one scroll area, safe-area spacing, visible close controls and restored keyboard focus. Hide the fixed navigation while searching or while the main site navigation is open. Retain the existing desktop basket dock above that breakpoint.
- The installable app uses the approved artwork. Show installation only after a browser request or clear platform instructions; an accepted prompt is not proof of installation. App updates require a user action and preserve the locally saved basket.
- The offline screen must explain the connection state without showing stale live availability, payment confirmation or order progress. Only static offline artwork and the offline screen belong in the service-worker cache; staff, tracking, API and authentication traffic remain on the network.
- Customer progress follows verified order, kitchen, packing and fulfilment evidence. Payment alone does not mean cooking has started. Show the real placement time and elapsed time only when valid server timestamps exist; do not fabricate ETAs or milestone timestamps.

## Arcade experience — 5 November 2026

- `/play` uses a compact introduction, a searchable game library and one focused playing area. On narrow screens, a modal game picker keeps the board close to the top of the page. Search and category changes preserve the current round; choosing another game starts a fresh round. The optional `game` URL value accepts only catalogue IDs.
- Arcade, card-game and quick-game surfaces use cream/paper, ink text and restrained red/yellow actions. Keep the approved food symbols and card-back artwork. Decorative perspective must not reduce board readability or touch accuracy.
- Each game explains its goal, legal moves, current progress and next action. Timed games start explicitly. Order Echo offers slower and user-paced playback, pauses when the page is hidden or the game picker is open, and resumes only through the player's control.
- Keep controls at least 44px where practical, scope keyboard shortcuts to the game board, and move focus to a useful next action when a card or control disappears. The mobile picker restores focus on dismissal; selecting a game focuses its playing region. Respect reduced-motion preferences.
- Gameplay stays free, account-free and independent of checkout and loyalty. Explain local scores and round resets plainly. Purchase rewards remain separate and inactive; game completion cannot create points, vouchers, food or monetary value.
- The arcade playbook records completed rounds in Sauce Switch, Menu Quest, Tray Tactics, Bento Sudoku and Tray Lines only. Identify its device-local scope and optional storage accurately; it is not board autosave, account history or a competitive leaderboard. Keep the summary collapsed initially so the mobile board remains close to the top.
- Daily launch links contain an allowlisted game and a real UTC calendar date. Preserve the started round's date across midnight. Keep tap and keyboard controls available in the two new games; Tray Lines edge targets must not overlap at narrow widths.
