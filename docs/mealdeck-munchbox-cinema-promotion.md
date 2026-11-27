# MealDeck Munchbox cinema prize draw — design draft

## Brand and prize
- Use the actual approved stacked-card MealDeck logo via the existing MealDeckLogo component; never recreate the logo.
- Film title and cinema name appear as ordinary text identifying the prize. No Marvel, Disney, Avengers or Cineworld logos, characters, posters or official type treatment. No suggestion of sponsorship.
- One cinema ticket: Avengers: Doomsday, Cineworld Luton, Wednesday 16 December 2026, 7:20pm (screening details supplied by the owner).
- Advertising begins **2 December 2026, 21:00 GMT** (teaser only).
- Entry window: **3 December 2026, 00:00 GMT** inclusive to **7 December 2026, 00:00 GMT** exclusive; qualifying registered customer website purchases during 3–6 December inclusive. This is four calendar days, not three.
- Public advertising automatically ends at the entry cutoff; closed terms remain available on Offers while the approved terms configuration is retained.

## Draft status / release gate
The component is mounted on the homepage and Offers but defaults to hidden. The no-store server response uses the fixed schedule in src/lib/mealdeck-cinema-promotion.ts; the browser cannot advance the phase on its own and stale visible copy expires. Before enabling, confirm the ticket is secured and transferable, eligible Munchbox item IDs, age/film admission conditions, exact eligible transaction channels, number of entries per account, refund/cancellation treatment, random draw date and auditable selection, contact and 24-hour response/collection rules, full terms and privacy notice. Winner filming must be voluntary and separately consented to. Marketing consent is not required to enter. Do not promise automatic entry or publish the promotion until eligibility records can be reliably reconciled against paid member orders. Check the proposed promotion against UK advertising/prize-draw requirements and cinema ticket conditions.

## Layout
Desktop: approved logo and generic cinema-ticket icon at left, copy and CTAs at right. Tablet/mobile: compact logo row followed by legible live text and wrapping/full-width CTAs. No flashing animation, no raster text, no third-party artwork, no obstructive popup. Verify 320, 390, 768, 1024 and 1440px viewports and keyboard focus before launch.


## Scheduled publication and operational approval
Set the following server-only deployment configuration only after reviewing the independent MealDeck catalogue and completing the private draw reconciliation, eligibility, full terms and ticket checks:
- MEALDECK_MUNCHBOX_CINEMA_PROMO_APPROVED=true (default false; case sensitive).
- MEALDECK_MUNCHBOX_CINEMA_PROMO_SKUS: JSON array of exact source-reviewed Munchbox SKU IDs, identical to the private export allowlist. Unknown/duplicate/empty IDs fail closed. The checked-in source catalogue does not currently identify a Munchbox, so do not substitute another product or invent its price.
- MEALDECK_MUNCHBOX_CINEMA_PROMO_TERMS: complete approved public terms, in plain text. Include age/film admission restrictions, entry limit, registered verified account and approved website channels, payment/cancellation/refund treatment, selection date and method, notification/24-hour response and replacement rules, collection and privacy/retention details. Obtain legal/owner approval; the code validates format, not the substance or legal compliance of those terms.

Preflight must verify actual live product availability, independent database identity and paid-order evidence, one-entry policy, prize availability/transferability, promotion terms/privacy and durable independent draw records. Configuration cannot itself prove these are ready; keep the flag off until the review is complete. The homepage teaser offers registration only, never an order CTA or early entry claim. At 00:00 on 3 December a fresh server response shows the live order CTA. At 00:00 on 7 December advertising hides, and Offers displays closed terms only. Cached visible copy is cleared at the boundary and on server errors; a failed response may briefly delay publication rather than show an incorrect phase. Test at the exact boundaries and on physical devices. No advertising email/WhatsApp is sent automatically; no payment or order authority is modified.
