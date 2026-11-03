# MealDeck design review — Phase 37 (navigation and interaction)

## References considered
- Existing-project design audit: [elayadesign/redesign-skill](https://github.com/elayadesign/redesign-skill)
- Landing page UX guidance: [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills)
- Existing MealDeck source and CSS remain the brand authority. No new third-party skill runtime, font or component dependency was installed.

## Current-state diagnosis
- Homepage already has distinctive card art, established typography, a brand grid and prominent preview CTAs. A full visual rewrite would risk brand integrity.
- Desktop navigation previously had no clear current-page marker. Homepage section links were visually indistinguishable.
- Mobile menu lacked Escape-to-dismiss, keyboard focus on first link, reliable restoration of trigger focus, menu-to-trigger relationship and route-change cleanup.
- Mobile menu link hit areas and focus indication were inconsistent, particularly during a longer scrolling list.

## Fixes
- Current route/section highlighting shared between desktop and mobile header links.
- Keyboard focus enters the open mobile navigation, Escape returns focus to menu trigger, and route/hash navigation closes the menu.
- ARIA menu expanded and controlled states, clearer focus indicators, comfortable touch areas, and scroll-safe menu height.
- Existing MealDeck dark/red/yellow palette, imagery, type, routes and coming-soon checkout gate remain unchanged.

## Next design phases
1. Mobile ordering discovery: scan menu navigation, empty states, clearer all-brand visibility and sticky review-basket affordance.
2. Checkout UI after Dishbee/Adyen staging readiness: address validation, delivery estimates, payment steps and state recovery. Never imply live checkout while launch flag is closed.
3. Consistent KDS/ops loading, errors, accessible data tables and colour contrast.
4. Tablet and narrow-mobile visual regression snapshots. Use real assets and consented copy, no fabricated testimonials or prices.

Tests: `bun test tests/mealdeck-nav-state.test.ts`. Run full GitHub verify workflow. This is a UI/accessibility patch, not a payment or deployment approval.
