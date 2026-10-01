# Light and dark mode

## Goal
Add a highly visible theme switch that works consistently across the entire MealDeck site on desktop and mobile, while preserving the premium red, gold, and playing-card identity.

## What will change
- Add a shared light/dark mode control in the main header so it appears on every page, including order and tracking.
- Add a compact theme control alongside the mobile navigation for one-tap access on phones.
- Use the visitor’s device preference on first visit, remember their choice locally, and apply it before the page appears to avoid a visible colour flash.
- Introduce a warm ivory light theme with deep ink text, refined red/gold accents, lighter page sections, and suitable shadows.
- Preserve the existing premium dark theme as the dark option.
- Tune shared cards, navigation, menus, forms, dialogs, tracking panels, blog cards, location pages, footer, and floating controls for legibility and contrast in both modes.
- Keep playing cards ivory in both modes so brand logos and card artwork remain consistent.

## Validation
- Check the homepage, ordering, tracking, location, blog listing, and blog article pages in both themes.
- Check representative desktop and mobile sizes for overflow, overlap, readable text, usable controls, and correct theme persistence.
- Confirm the theme switch has a clear label, keyboard focus, and an accessible name.

## Technical details
- Theme state will be managed by a small shared React provider using a class on the document root and local browser storage.
- Semantic colour tokens in the global stylesheet will define separate light and dark palettes; page code will continue using those tokens.
- A tiny inline startup script in the root document will select the saved/system theme before first paint.
