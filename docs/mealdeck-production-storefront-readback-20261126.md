# Production storefront publication gate

GitHub main and the Lovable-connected branch are separate. At the 26 November review the connected project was on feature/dishbee-play-food-cards. Always check its current exact revision rather than assuming main publishes automatically. Preserve the connected branch's unique commits and review any Lovable-generated changes.

After a verified sync and publication, run **MealDeck public storefront release readback** via GitHub Actions workflow_dispatch, or `node scripts/mealdeck-storefront-readback.mjs --live`. The probe checks the homepage, current offers, first-order guide, menu favourites/search markers, permanent legacy redirect, and sitemap. It only reads six fixed public paths and reports boolean/status results. It creates no account, order, payment or tracking event.

The probe proves only public content at the time of testing, not the exact hosting revision, actual browser hydration, checkout acceptance, physical printing, or driver readiness. Read the Lovable revision separately and verify mobile/desktop browser behavior. A red probe must not be bypassed; confirm publication and edge caching. Keep old order and promotion records intact.

## Expanded readback
The public probe now covers 22 fixed routes, including the privacy notice, three location pages, five individual menus, the blog listing and all six existing article URLs. It rejects expired campaign text, stale launch labels, old offer links and expired copy in metadata, and checks the current fulfilment guide, favourites and updated article markers. Requests run in bounded groups of four. It does not modify the historical campaign terms or transaction data. A green fixture run is not a successful live run.

## Responsive navigation readback — 27 November
The homepage probe now also requires exactly one server-rendered Main navigation with the direct /account (My account) and /play (Play games) links. Stale Play & Rewards copy in that navigation, wrong destinations, duplicate main navigation and links present only in inert scripts/comments fail the homepage check. This detects the merged navigation content; it does not prove viewport visibility, keyboard behaviour, browser hydration, or the exact published Git revision. Existing public routes and payment safety boundaries are unchanged.
