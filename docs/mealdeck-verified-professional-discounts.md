# MealDeck — verified NHS, emergency services and education discounts

**Status: implementation design and guarded policy tests only. No staff discount is active or available for redemption.** The owner has not yet approved a percentage, minimum, cap, verification contract or live launch. The `MEALDECK_PROFESSIONAL_DISCOUNTS_LIVE` source constant is intentionally false. Do not advertise a live discount or create a generic code.

## Eligible audiences to configure, not to auto-approve

Candidate categories: NHS/healthcare, police, fire/rescue, ambulance, education/teaching, social care and armed forces. An operator must choose which occupations, active/retired statuses and approved locations qualify. A user's self-selected occupation, NHS email suffix, uploaded screenshot, WhatsApp phone or Blue Light Card number alone is **not** sufficient proof.

Blue Light Card's eligibility catalogue currently includes NHS, emergency services, education (including teachers and school staff), social care and armed forces. Source: <https://www.bluelightcard.co.uk/en/eligible-professions> and <https://support.bluelightcard.co.uk/hc/en-gb/articles/51153480024337--Education>. This does not grant MealDeck permission to claim Blue Light Card partnership or authenticate membership.

## Approved verification integrations (choose ONE)

1. **Blue Light Card selected-partner verification API.** Request a merchant agreement and production API credentials. Its API is advertised as returning verification outcomes without sharing unnecessary personal data; confirm the actual product capabilities, category coverage, merchant rules and developer contract before integrating. <https://www.bluelightcard.co.uk/verifynhsandbluelightcard.php>
2. **GoCertify** with a retailer-specific key-worker verification flow; eligibility may be checked directly from work email or supporting evidence. The verified outcome must be delivered via an authenticated provider integration, not an unsigned browser redirect. <https://shopper.gocertify.me/en/articles/3493570>
3. **SheerID** with merchant identity/educator/first-responder/healthcare verification, under an approved commercial integration. Confirm callback signatures and expiry semantics in the agreement. <https://www.sheerid.com/faq/>

Do not implement insecure workarounds: publicly reusable coupon codes, card number screenshots, self-attested job titles, predictable /verify?eligible=true URLs, raw document uploads into ordinary MealDeck Storage, or MAC/IMEI/device-fingerprinting as eligibility evidence.

## Required server-authoritative release design

- **Source of identity:** verified MealDeck Auth user with confirmed email and completed customer profile. Marketing consent is optional; it is never a discount qualification condition.
- **Verification:** redirect to the chosen verification provider with a state nonce bound to the authenticated account, campaign and expiry. The server validates provider signature and/or retrieves status from its official API with secret credentials. Check issuer/audience, successful verification, approved category, nonce, replay protection, time window and revocation.
- **Data minimisation:** store only internal user ID, approved eligibility category, provider, HMAC-hashed provider subject, provider event hash, verified/expiry/revoked timestamps, and a narrow audit event. Do not store IDs, payslips, photos, staff numbers or raw Blue Light Card numbers. Keep records private under RLS with explicit revokes and a justified retention policy. Follow <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/>.
- **Campaign controls:** owner-configurable, **default disabled** per location; approved fixed discount percentage and max pounds; fixed start/end and provider/category coverage; minimum eligible food spend, one-use/day or other approved cap. No unreviewed discount stacking. No staff-readable direct SQL grant to activate campaigns.
- **Atomic redemption:** after authenticating the member and revalidating provider status, lock `campaign + hashed provider subject + UK-local business date` and canonical order; reserve one claim in the same DB transaction that freezes the authoritative quote. Unique indexes for both verification subject and customer prevent duplicate claims across alternate account/email/phone combinations. Reuse the same claim on a retried payment. Do not consume a claim on failed payment; on refunds/cancellations reconcile the claim without duplicating money movement.
- **Authoritative price:** apply discount solely within the existing MealDeck Postgres quote and payment preparation routine; never alter browser-only menu or accept a customer-supplied `discountPence`/`discountPercent`. Calculate in integer pence. Requote when eligibility or price changes and show an itemised discount line **before** payment.
- **Nonstacking:** default one professional offer per order, no simultaneous first-order, opening, milkcake, double-points or other percentage campaign. Loyalty remains **1 point per complete £1 actually paid after discounts**, not gross.
- **Group rooms:** a separate-payer participant can qualify only their OWN verified bag. An organiser's eligibility cannot subsidise everyone else's items unless a specifically approved whole-order policy exists. Each share/discount is frozen atomically and fully paid funds release exactly one KDS order. Existing partly paid/processing rooms are never repriced or deleted. Do not enable group-room discount stacking until concurrency and Stripe read-back tests pass.
- **Fulfilment:** decide explicitly whether delivery applies. The existing **free delivery at £15 after discounts within 4 km of LU4 8NU** must still be enforced by the same server quote. Exclude third-party marketplaces unless merchant contractual terms permit it.
- **Security and operational controls:** credential rotation, webhook allowlist/signature/time window, idempotent provider event IDs, rate limits by user and hashed provider subject, abuse telemetry without extra device tracking, owner-only enable/pause switches, ledger audit and an emergency kill-switch.

## Suggested commercial terms for owner review — NOT activated

A **possible** starting design is 10% off eligible food subtotal, minimum qualifying spend £15, maximum saving £5 per order and one discounted order per verified person per day, for direct MealDeck channels only, not combinable with other promotions. This is a proposal, not an agreed price or published offer. Margin analysis must account for marketing, royalty, technology and packaging fees before approval.

## Acceptance before any live badge or marketing claim

- Merchant/provider contract approved, integration read-back and wrong-audience signature tests passed.
- Two actual verified professional categories and an unqualified customer tested against sandbox with consent and data minimisation.
- Exact money/rounding and no-stacking checks pass on the independent MealDeck database, under SQL transactions.
- Replay, two-account same-provider-identity, two-device simultaneous checkout, refund and eligibility-expiration cases pass.
- Group-room participant discounts do not leak into other people's bags or affect frozen, paid or partial-payment orders.
- Actual provider-backed verification, controlled low-value test payment, KDS, receipt, account balance, privacy notice and customer support procedures accepted by the operator.

Never enable or announce this feature merely by merging its GitHub code. The existing `mealdeck_private.customer_offer_claims` table protects one-off marketing offers; it does not by itself verify professional eligibility or alter checkout prices.

## Group ordering release gate (separate concern)

`MEALDECK_SHARED_PAYMENTS_ENABLED=true` alone is not enough. Public availability also requires the MealDeck online checkout to be ready, a valid `MEALDECK_GROUP_LINK_SECRET` in the runtime and a live site on the correct revision. A **read-only GET** check is provided by `scripts/check-mealdeck-public-group-readiness.mjs`, and does not create/charge real orders. Only call group ordering fully live after a two-browser invitation/acceptance, participant choices, frozen price, actual permitted Stripe test, and single KDS release are verified. The accepted three-minute invitation window and server-side group draft expiry are distinct from five-minute browser basket expiry.
