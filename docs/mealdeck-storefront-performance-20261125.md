# Storefront performance and navigation follow-up

- Reuse the browser QueryClient for the public Luton delivery indicator. Cache a boolean only; send no cookies, bearer or customer identity. The authenticated checkout, server pricing, live availability, guest claims and KDS payment gates are unchanged.
- Restrict membership notice mounting to the three marketing routes. Retain the eight-second automatic dismissal, user close and session-level suppression. Retire the old Sunday/launch announcement fallback. Registration remains server-gated.
- Prioritize the existing authenticated customer account/order history on mobile; retain the games tab and delivery tracking information in existing site links. Align menu and location copy with checkout-confirmed delivery eligibility.
- Verify public gate parsing, failure behavior and anonymous fetch options. Keep existing safe-area and checkout handoff regression tests. Do not claim a measured speed improvement until browser traces are collected.
- Next: actual PWA and viewport QA; LCP/INP/CLS measurements; menu navigation and image budgeting; authorised production payment, driver, printer and RLS acceptance. AI/agent features remain bounded by existing canonical menu and permission rules.
