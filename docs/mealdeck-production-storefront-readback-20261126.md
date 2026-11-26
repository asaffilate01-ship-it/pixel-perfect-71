# Production storefront publication gate

GitHub main and the Lovable-connected branch are separate. At the 26 November review the connected project was on feature/dishbee-play-food-cards. Always check its current exact revision rather than assuming main publishes automatically. Preserve the connected branch's unique commits and review any Lovable-generated changes.

After a verified sync and publication, run **MealDeck public storefront release readback** via GitHub Actions workflow_dispatch, or `node scripts/mealdeck-storefront-readback.mjs --live`. The probe checks the homepage, current offers, first-order guide, menu favourites/search markers, permanent legacy redirect, and sitemap. It only reads six fixed public paths and reports boolean/status results. It creates no account, order, payment or tracking event.

The probe proves only public content at the time of testing, not the exact hosting revision, actual browser hydration, checkout acceptance, physical printing, or driver readiness. Read the Lovable revision separately and verify mobile/desktop browser behavior. A red probe must not be bypassed; confirm publication and edge caching. Keep old order and promotion records intact.
