<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Server group ordering rooms — current direction, 6 November 2026

- `/group-order` now uses one server-backed room for an organiser and up to nine invitees. People explicitly accept their private invitation, join, choose their own food and mark their choices ready. This replaces the local invitation/return-link workflow below; no reply-link review or messaging thread belongs in the current room flow.
- Use the server's **three-minute join deadline**. Only people who have not joined expire automatically. Expiry is enforced on server reads/actions, not by trusting the browser countdown. A joined participant who is still choosing must be resolved explicitly before finalisation; never silently drop a joined, processing or paid participant.
- The organiser alone reviews and finalises the complete current room revision after all remaining people are ready and no invitations remain pending. Validate current catalogue choices and canonical prices, allocate every quantity exactly once, and freeze food, participant/bag assignments and per-person billing before any payment. No post-freeze pick edits or regrouping.
- New rooms offer **each person pays for their own food** or **organiser pays for everyone**. Do not add equal split to the new room UI. Retain historical equal-split payment records and their recovery paths; old amounts and settled shares are immutable.
- Each person's canonical short name belongs in the server room and frozen packing snapshot. Carry `bags[].name` alongside the bag number into customer review, per-person billing, KDS and receipts, for example `Amer · Bag 1`. Keep flavours and attached extras with the same person. Legacy unnamed bags remain valid. Names are escaped text, not contact details, account identity or payment authority; ordinary checkout must not accept injected participant names.
- Only full verified funding can release **one complete master kitchen order**. Existing server payment claims, same-attempt recovery, late capture/refund review, separate staff acceptance and receipt idempotency remain mandatory. The three-minute joining deadline is distinct from the payment window and never releases an unknown payment claim.
- Reuse `MEALDECK_SHARED_PAYMENTS_ENABLED`, `MEALDECK_GROUP_LINK_SECRET` and the canonical online checkout/kitchen gates; there is no new room feature flag or secret. Install the guarded ordering-room migration after the current Checkout-domain extension. Keep private room records and invitation secrets out of public routes, logs and caches.
- Auth may return to the fixed `/group-order` destination through `/account?returnTo=%2Fgroup-order`. Never place room IDs, invite capabilities or arbitrary query strings in the email return URL. The room restores its own authorised context. See `docs/mealdeck-group-ordering.md` for setup and the superseded flow record.

## Branded checkout and connection diagnostics — 5 November 2026

- The owner chose `pay.mealdeck.co.uk` as the Stripe-hosted custom domain and reported adding DNS. DNS and an application allowlist are not evidence of Stripe's Active status. Permit the exact approved host only through the reviewed server setting and additive database validation; preserve provider-returned URLs. Payment Links and Customer Portal are Stripe account settings, not substitutes for the canonical MealDeck order session.
- A saved Checkout session must be recovered from Stripe using its original ID and verified binding. A changed, missing or rejected URL must never silently create a replacement payment attempt. Keep webhook reconciliation available when new checkout configuration is disabled or invalid.
- `/api/ops/integrations` is a read-only owner/admin diagnostic for the trusted Luton mapping. Verify current Auth identity, MFA, role and SQL finance permission before inspecting configuration. Return fixed setting names and safe status text only. It must never send mail, create payment/provider objects or change kitchen settings. Configuration is separate from provider acceptance, native signing/device acceptance and inbox delivery.

## Shared payments, native phone collection and latest branding — 5 November 2026

- The owner requested separate group payments, shared payments, and Stripe Tap to Pay on both Android and iPhone. The underlying frozen server-priced payment ledger supports **pay by numbered bag**, historical **equal split**, and organiser **cover unclaimed balance** alongside single-payer checkout. The current server-room flow above supersedes the local choice planner and offers own-food or organiser-all payment only. Preserve existing equal-split records and recovery. See `docs/mealdeck-shared-payments.md` and the database contract.
- One active claim owns each share. Keep all money in integer pence, account/mode/order/quote bindings immutable, and provider confirmation authoritative. Browser returns and native SDK success cannot mark paid. Full verified funding releases one shared KDS order; staff acceptance still queues the first receipt separately. Cancellation/refunds/disputes require explicit review and never imply an automatic refund.
- Existing payer-owned Checkout attempts can be resumed with the exact original attempt and amount. An organiser may not resume another person's payment. Claim deadlines never locally release unknown payments. Only independently verified Stripe cancellation/expiry does. Unbound creation retries must remain inside the original shorter claim lifetime, because provider idempotency retention is finite.
- `apps/mealdeck-terminal` is the native staff companion. `/api/terminal` verifies current `payments.collect` permission, independent MealDeck kitchen scope, MFA when enrolled, canonical quote and provider account/location. Native source, CI compilation, Apple entitlement approval, signed distribution, physical-phone acceptance and live merchant activation are separate outcomes. Keep runtime switches disabled until the configured integration is accepted.
- The owner supplied the brand line **MealDeck — One order, every craving**, canonical `https://mealdeck.co.uk`, social handle **@mealdeckoffical** (preserve that exact spelling), and natural Luton search terms for Skorch burgers, Tavo chicken, Moktl mocktail lounge, Souvano Greek and Turkish food, Load’d loaded fries, and mac and cheese. No invented address, rating, opening schedule or delivery availability in SEO.
- Verification email should use Resend with the approved MealDeck logo, while preserving existing Auth verification/PKCE authority and separate marketing consent. Adding a Resend API key alone does not switch Lovable Cloud Auth delivery: configure the actual supported Auth SMTP/Send Email Hook and verified sender domain. Keep all secrets server-only and never claim mail was sent without a provider result.

## Superseded host-pays group release — 5 November 2026

The following records the earlier local flow and its compatibility requirements. It does not define the current `/group-order` room UI, name retention or payment choices.

- The initial `/group-order` release collects exact choices through individual invitation and return links, lets one organiser review and combine them, and hands one basket with numbered bags to checkout. It supports up to ten people, matching the packing contract. The choice planner is not a server-synchronised basket. The later payment-room implementation above supersedes the initial one-payer limitation; availability remains runtime-gated.
- Keep organiser drafts and reply drafts separate from the personal menu basket. Shared links contain identifiers and food choices in their fragment, never contact details, names, account credentials, authoritative prices or payment state. Choices are untrusted and must pass current-catalogue and final server validation.
- Preserve explicit reply review, replacement instead of duplication, reviewed-response history and the saved-draft freshness check. Restore a group checkout atomically with its complete packing allocation; stale/missing choices or group metadata must produce a recoverable group error, never a partial order or personal-basket fallback.
- Authentication may return only to the fixed allowlisted destinations, including `/checkout?group=1`. Keep actual member/guest eligibility, kitchen state, payment readiness and verified-only KDS release unchanged. See `docs/mealdeck-group-ordering.md`.

## Three November consumer offers — latest owner decision, 5 November 2026

- Publish exactly these three consumer offers and remove the previous sample deals: **30% off the entire menu, Friday 6–Sunday 8 November 2026**; **milk cake 99p with every order on Sunday 8 November**; **register and spend £15 or more by and including Friday 13 November for double loyalty points**. Preserve the confirmed Luton opening hours and existing collection/kerbside scope.
- The 30% offer retains no minimum and welcomes guests and members. The milk-cake offer does not require registration. Guest orders earn no loyalty points; the double-points offer requires membership. Marketing email/push opt-ins remain separate and optional.
- Do not invent a cake flavour/size, additional minimum, quantity cap, stacking rule, loyalty base rate or spend calculation basis. The shared public catalogue is `src/lib/mealdeck-offers.ts`; the missing canonical cake product and points configuration are tracked in `docs/mealdeck-offers-20261105.md`.
- Publishing confirmed terms is separate from activating automatic cake pricing or point awards. Keep both unconfigured paths inactive; preserve payment gates, canonical pricing, verified payment evidence and all historical paid-order amounts.

## Confirmed opening hours and guest ordering — latest owner decision, 5 November 2026

- The owner requested easy **Online / Busy / Pause / Closed** controls on admin. Show the saved state on Overview and Finance, apply changes through verified owner/admin RPCs, and retain tenant/kitchen scope. Online and Busy may accept new orders only when every payment/menu/opening gate passes; Busy uses the explicitly configured pickup estimate, without an invented delay. Paused and Closed stop new checkout but preserve already-started payment reconciliation and existing order/receipt/KDS progress. They never resume automatically. Stopping orders must remain possible even if a pickup-estimate edit is unfinished.
- Confirmed Luton opening: **Friday 6 November 2026, 15:00–23:00; Saturday 7 and Sunday 8 November, 13:00–23:00**, Europe/London. These dates supersede earlier unscheduled-date notes below and in historical documents.
- During those exact daily windows, customers may order **without registering**. The 30% opening offer has no minimum and includes eligible guest and member collection/kerbside orders. The kitchen closes between the daily windows; this is not a rolling three-day window from signup.
- Guest orders earn **no loyalty points**, create no Auth/member account and never opt the customer into marketing. Registered, verified membership is required for member-only offers; promotional email and push preferences remain separate and optional. Do not invent loyalty earning rules or enable notification delivery before configured.
- Guest contact details do not prove identity. Receipt access uses a scoped, high-entropy, HttpOnly, Secure, SameSite cookie, with only its hash stored in the private database. Keep guest and member orders separate even if their email addresses match. Existing guest receipts remain readable after launch closes until session expiry; no fresh guest checkout after Sunday 23:00.
- Kerbside pickup requires the customer's name, WhatsApp number, car make, colour and exactly the last four registration characters. Show the car fields as soon as kerbside is selected, and include all five details in the final customer review and active authorised staff ticket. UK registration suffixes may contain letters and digits. Contact numbers are order contact details, not proof of WhatsApp registration or marketing consent.
- Implement through the existing shared canonical pricing, payment verification, packing, KDS and receipt paths. Preserve scoped RPCs, RLS, existing history and all runtime payment-readiness gates. Guest access must not weaken staff or printer authentication.

## Launch prices, membership and Stripe — owner decisions, 5 November 2026

- On **6 November 2026**, the owner added **Biscoff Milkcake £3.99** and **Oreo Milkcake £3.99** to the Desserts section of every current launch menu, with optional dessert upsells. Keep them as standalone items with explicit flavour names through basket, packing, KDS and receipts. The flavour already appears in each product name; do not repeat it in section or item subheadings. The additive source approval is `owner-desserts-20261106`; the live catalogue and its reviewed public mapping both need the ten product identities. This does not change the separately configured Sunday 99p campaign or supply recipe/allergen declarations.

- **Luton is the only launch location.** St Albans and Bedford remain coming soon. Walk-in, pickup and kerbside payment work is for the authorised Luton kitchen; future location configuration must not accidentally enable ordering elsewhere.
- The owner requested Stripe Tap to Pay for walk-in and kerbside customers. Direct phone acceptance requires a supported native Terminal integration; the existing PWA can alternatively control a supported reader through the backend. Follow `docs/mealdeck-in-person-payments.md`; preserve one order/payment and one shared KDS release, and never charge an already-paid collection again.
- The owner's detailed **Skorch, Load’d, Moktl, Tavo and Souvano menu/prices supersede every £20 placeholder**. Use the current shared launch catalogue as the supplied menu record, integer pence throughout, and the exact Tavo flavour/portion matrix. Skorch and Load’d chicken nuggets cost £4.00; Tavo's cost £3.50. Their drinks lists and burger add-on prices also differ. Souvano has three mains: Stir-Fry Doner £6.50, Heatwave £6.99, Middle Eastern flavour Lamb Chops £9.99, each including fries/rice/naan. Souvano's doner also requires a flavour choice. Do not restore its older unpriced drinks or assumed meal surcharge.
- Meals cost £2.50; replacement fries £2.99, mac £3.99, mocktail/milkshake £2.99, peri salt £0.50. Charge a named cross-brand replacement once. Included can/water choices use that brand's listed £1 range; Red Bull remains a separately priced product. Do not invent milkshake flavours or rewards rates.
- Opening weekend: **30% off everything, no minimum, Luton collection/kerbside only**, during the confirmed daily hours above for both guests and registered members. Marketing consent, app installation and browser notification permission must not be offer requirements.
- Registration asks for name, email and phone; verify email through Auth. Request an address only for delivery. Kerbside requires car make, colour and the last four registration characters, never a full registration. Email marketing, promotional push and order notification choices are separate, optional and auditable. Browser permission alone is not marketing consent.
- Latest collection launch flow: **delivery is unavailable**; show that explicitly and allow collection or kerbside only. Paid confirmation provides the order/handoff number and a kitchen-configured pickup estimate. Customer progress follows payment, staff acceptance, preparation, all-items-ready/packing, and confirmed handoff. Do not invent an ETA or mark an order accepted merely from payment.
- Customer, KDS and receipt-printer PWAs have distinct install identities. Staff and printer permissions must be enforced by authenticated, scoped RPCs; manifest separation is not an access-control boundary. Cache no private data. Receipt jobs are enqueued once on staff acceptance, with visible recovery/reprint controls. Silent printing needs a configured printer connection; never call browser-dialog completion proof of physical printing.
- Before confirmation and payment, show a clear order review with quantities, every selected flavour/extra, prices, total and fulfilment. Offer optional cutlery and separate packing into numbered bags. Allocate every item quantity exactly once; keep attached meal extras with their parent allocation. Persist Bag 1/2/3 labels and cutlery in the server-validated order snapshot, customer receipt, KDS and printer receipt. Packing preferences carry no invented charge. WhatsApp ordering remains clearly coming soon.
- The owner requested backend and checkout activation and confirmed that MealDeck is on a **separate Lovable account**. Access to the correct project is now restored. Its reviewed independent foundation was installed atomically on 5 November; see the deployment record for verified scope and remaining owner/bootstrap/configuration work. Source merges, schema installation, publication and accepted payment processing are distinct outcomes.
- The public development/test and production/live-mode Stripe keys are configuration only; they do not establish account readiness or payment integration. Real checkout still requires the independent MealDeck schema, canonical prices and modifiers, authenticated provider confirmation, idempotent order reconciliation and verified kitchen release. Do not convert the existing pending-order response into a paid order or expose a payment button that cannot create a real provider session.

## Independent MealDeck backend — owner decision, 4 November 2026

- MealDeck is a trading name of **313 Brands Ltd**, with the technology credit **Powered by Dishbee**.
- Use an independent MealDeck Supabase project/database. This explicit owner decision supersedes the earlier shared-Dishbee database ownership assumption in historical phase documents. Keep verified payment, staff permissions, tenant/kitchen scoping, source isolation and launch gates intact.
- The standalone database profile is documented in `docs/mealdeck-independent-backend-phase47.md`. Never apply its fresh-project bootstrap to Dishbee, Cafe 1 or another existing application database. Never copy production merchant/customer/payment records as seed data.
- Staff and customer runtime connections must use the same explicitly configured MealDeck project. Do not silently fall back to Dishbee credentials or combine a URL from one project with a key from another.
- One current kitchen means one shared KDS screen for all brands. Future kitchens get separately authorised screens. Keep one complete order card through preparation and packing.

- Keep the commercial homepage brand collection independent from location-filtered ordering menus, because marketing and operational availability can differ.

- SEO head tags come from the shared `seo()` helper with mealdeck.co.uk as the canonical base — keeps canonical/og consistent per page.
- Blog posts live in a static list and render as playing-card tiles — no backend needed for content yet.
- Global light/dark appearance is controlled by the shared theme provider and semantic CSS tokens — keeps every route and overlay synchronized.
- The homepage card showcase uses a brief all-brand fan-to-deck intro before its repeating brand reveal — keeps food primary while retaining the playing-card identity.
- Hero card ranks and suit counts come from a separate browser-safe deck definition, leaving restaurant availability untouched; corner emblems are extracted from the approved card artwork.
- Hero and offer cards import the same food-suit artwork map so their corner emblems stay consistent.
- Play uses a separate realistic food artwork map so game imagery can improve without changing approved logo and marketing card emblems.
- Ordering uses a browse-first, restaurant-led marketplace layout while serviceability is confirmed separately — keeps discovery fast without weakening location rules.

- Review `PRODUCT.md` and `DESIGN.md` before MealDeck feature/UI changes. Preserve the card/food identity, existing approved artwork, app vs marketing contrast tokens, and clearly marked sample/illustrative menus.
- Develop via the GitHub codebase and tests; do not invoke Lovable as a build environment. Leave all existing Git/Lovable history untouched.
- MealDeck must never assume that a WhatsApp chat, agent response, browser redirect or illustrative price is a paid order. Only the configured MealDeck backend's verified server-side payment/order authority can release KDS.
- Per-location official WhatsApp business numbers are server-configured, verified and disabled by default. No private account/customer data, checkout state or prices in chat-link query strings. Omniqora keeps channel identity; Cafe 1's independent EPOS and restricted menus stay separate.

## MealDeck Phases 19–21 safety and design contract

- Treat source module group allocations as **illustrative plans**. The only live settlement authority is the MealDeck backend's immutable server-priced order/share ledger plus verified provider event receipt.
- Keep multi-brand delivery fee once per master order. Allocations must have no lost/duplicated pennies or unassigned quantity.
- Use src/lib/mealdeck-agent-guardrails.ts as a **server-side admission policy only**: never convert a model-provided boolean, role, tenant, order ID or permission to trusted identity. Do not enable arbitrary MCP/SQL, provider webhooks, KDS releases, payments or courier bookings from an LLM.
- Human review is mandatory for allergens, disputed payments, delivery exceptions and refunds. AI outputs and traces must redact personal information and secrets.
- Protect St Albans MealDeck delivery-only policy independently from Café1 counter/EPOS fulfilments. Coming Soon remains true until approvals.
- Apply Taste, Impeccable and Awesome DESIGN.md as design heuristics; do not import competitor code or AGPL sources into this proprietary repository.

## MealDeck Phase 22/23 canonical runtime boundaries

- Match the configured backend's serviceability responses only by trusted server-configured
  tenant and location UUID pairs. City and postcode strings are never routing
  authority. Unknown, ambiguous, missing and failed RPC responses mean not
  verified; never turn them into sample-confirmed live serviceability.
- Treat `create_mealdeck_checkout_order` receipts as payment **pending**
  only, and require the canonical UUID + four-digit handoff code format. A
  browser redirect or service call cannot mark the order paid.
- Keep customer checkout fail-closed unless both `COMING_SOON=false` and the
  separate server-only `MEALDECK_CHECKOUT_INTEGRATION_APPROVED=signed-off`
  release switch are intentionally changed after staging acceptance. The
  environment switch is NOT a replacement for a real payment session adapter.
- Do not enable checkout until MealDeck's signed webhook, group payment,
  source-of-funds split, KDS, one-delivery orchestration, full refunds,
  replays and customer payment UI are functional and accepted.

## Phase 27 source-owned fee estimates

- The customer basket never chooses a delivery fee. MealDeck's current
  server-side catalogue reprices each item and modifier ID before a delivery
  policy RPC can estimate one location-level fee. Missing live policy means
  no checkout, not an assumed flat £2.99 or free delivery.
- The MealDeck checkout RPC still accepts a deprecated p_delivery_pence
  argument; this app deliberately passes zero and relies on the independent
  backend-configured fee plus reviewed database guard. Never turn off
  COMING_SOON or the other checkout gate until that guard passes staging in
  the independent MealDeck project and a real provider payment session exists.
- An estimate is not a courier quote, final order, captured payment or
  order confirmation; it can change during checkout.

## Phases 28-30 signed checkout quotation

- All customer-facing quotes must be issued by the MealDeck server after
  checking MealDeck's current tenant/location serviceability, catalogue
  modifiers and kitchen policy. Do not trust browser prices or a city name.
- The quote token binds the tenant/kitchen, fulfillment, normalized customer
  postcode, exact item IDs, quantities, modifier IDs and integer-pence amounts
  to a short expiry using a server-only HMAC signing secret.
- Verify the token and reprice again against the current canonical MealDeck
  records before creating any pending order. Stale quotes fail closed.
- Signed quotes are NOT a provider guarantee, fund capture, an order booking,
  a payment session, or a sufficient go-live signal. The current checkout RPC
  still lacks a proven idempotent pending-order creation and dedicated
  MealDeck payment-provider session; production release gates stay off.
- The payment and privacy secrets must not go in public environment
  variables or public client modules. Never use unsigned browser status to
  publish kitchen tickets.


## 6 November 2026 kitchen release and live acceptance

- The owner requested the improved KDS ticket/stage views, menu manager, louder KDS alert, and commit/push/merge/publication together.
- Only server-confirmed paid orders may enter the KDS. Browser success redirects, pending payment and partially funded shared orders are insufficient. Preserve full-order visibility, staff acceptance and exactly-once receipt queueing.
- The owner explicitly requires one real live Stripe order using the authenticated `test@mealdeck.co.uk` account before opening to everyone else. Keep the existing database-owned pre-opening identity/window restrictions. A sandbox simulation alone does not satisfy this acceptance.
- Preserve the three-day name-and-WhatsApp guest checkout change for 6–8 November. Email is optional; new email registration resumes at 00:00 UK time on Monday 9 November. Existing member sign-in remains available.
- Physical printer output and an actual provider payment must be observed before reporting live acceptance complete. Never fabricate payment, print, or handover evidence.

- Later in the same release, the owner requested hiding public member/email sign-in as well as registration until Monday 00:00 UK. Keep explicit secure `/account?signin=1` access for the approved live verification; this is presentation only and confers no permissions.
- Group ordering stays visible with “Starting 9 November”. New ordering/shared-payment rooms open at 00:00 UK on 9 November; existing room/payment recovery remains available. Enforce new-room timing on the server.
- The menu item quick availability actions read “Out of stock” and “Back in stock” for the current kitchen; keep global deactivation scope explicit. Shared add-on/upgrade price edits apply everywhere that canonical option is offered.

## Public collection launch and numbered tickets — latest owner decision, 6 November 2026

- A real £3.49 live Stripe payment by the approved test customer was verified at 18:22 UK, progressed through item readiness and packing, and was handed over at 18:28. The owner subsequently explicitly authorised public ordering. Anonymous `/api/checkout` verified public availability and eligible guests at 18:41 UK, with Luton online and a 30-minute estimate. Keep the existing dated opening hours, kitchen controls and payment authority; public approval is not approval for delivery, other locations or uncommissioned payment channels.
- Assign a permanent sequential order number per tenant/location only to canonically verified paid orders: the first live test is `0001`, then `0002`, and onward. Allocation must be transactional, concurrency-safe and idempotent, with no daily reset or reuse after cancellation/refund. Pending or failed payments receive no number. Existing random four-digit collection codes remain separate handover proof and must not be changed or relabelled as sequential numbers.
- Show the sequential number across the customer receipt, KDS, operations and newly queued print snapshots. Preserve historical receipt contents and delivery evidence; a wholly unsent queued snapshot may receive only the audited additive number through the guarded administrative helper.
- Active collection and kerbside KDS tickets show the frozen customer name and contact number; kerbside also shows car make, colour and the final four registration characters. Keep the stage tabs visible when tools are hidden and keep each-item readiness, packing confirmation and collection-code handover checks intact.
- Public navigation and `/track` must label delivery tracking **Coming soon**, with no customer sign-in redirect. Paid collection progress remains available through the existing private confirmation page. Remove obsolete launch copy saying all ordering is closed while retaining coming-soon labels for delivery, future locations, WhatsApp and phone ordering.
- The receipt for the live test was queued on acceptance, but physical paper output has not been confirmed. The current Node/TCP receipt bridge is not a built-in Senraise Android printer adapter. Do not describe PWA installation or queued jobs as successful device pairing or printing.

## Stock, special requests and compact staff screens — latest owner decisions, 6 November 2026

- Included meal and kids' can/water choices must follow the current availability of their exact reviewed standalone stock SKU in the same brand and kitchen. Use stable source-ID bindings, never product-name guesses. Both the safe public menu and canonical new quote/materialisation must enforce the stock helper; a modifier's independent active flag cannot override an unavailable linked drink. Preserve recovery, prices and verified reconciliation for already prepared payment attempts.
- Optional customer special requests are plain text, limited to 1,000 Unicode code points, reviewed before payment and frozen with the canonical quote. Copy them once into a new order and carry them through authorised customer review, KDS and the immutable acceptance receipt. Blank requests preserve legacy quote behaviour. Reject unsafe control/format characters; notes never change catalogue choices, prices, availability, allergen declarations, payment authority or packing allocations. Existing prepared orders and historical receipts are not rewritten.
- Keep the KDS compact and practical on mobile and desktop while retaining complete purchased choices, quantities, customer contact, visible stage tabs, each-item readiness, packing and collection-code handover. Show a selected portion/flavour as kitchen instructions without presenting its internal base-price delta as a separate customer charge; the canonical purchased unit price is unchanged.
- The owner requested stronger, distinct KDS and printer alerts on mobile and desktop. Retain explicit sound enablement, device-volume guidance, saved volume preferences, visual notices and zero-volume silence. Initial hydration, replay and reconnect must not repeat previously heard orders; one observation batch must not create overlapping acceptance/receipt sounds. Audio never accepts an order or confirms a print.
- Keep the dedicated `/printer` PWA as the operator screen. Automatic printing requires a supported actual printer connection and the existing canonical claim/receipt-copy guards. Do not add an unofficial Senraise adapter, infer the model from a serial, or repurpose payment permissions for printer accounts. A manufacturer SDK/service contract and actual-device acceptance are required before advertising integrated Android printing. See `docs/mealdeck-senraise-printer-status.md` and `docs/mealdeck-stock-and-special-requests.md`.

## Default loud staff alerts and branded receipts — latest owner decisions, 6 November 2026

- The owner repeatedly requested KDS and printer sound **on by default and loud** on mobile and desktop. New unsaved preferences default on at 100%; preserve an explicit saved mute or volume choice. Only an actually running audio context may report sound active. Unlock on a trusted interaction when the browser requires it, with a visible Enable sound action; never replay old orders when sound becomes available. Muting, zero volume, suspension and unmount cancel queued tones immediately. Keep distinct bounded cues and prevent overlapping tones.
- Use the existing approved MealDeck logo on browser receipts and the supported thermal renderer. Thermal artwork is a fixed, reproducible monochrome derivative of the complete approved source. Receipt data cannot supply a logo URL or arbitrary bytes. Load the browser logo before entering a send attempt, preserve canonical receipt arithmetic/fingerprints and the one-copy journal, and do not claim physical paper from renderer completion.
- The first six handed-over receipts were archived at 20:11 UK, preserving their actual statuses, delivery attempts, payment history and payloads. The terminal operator had resolved 0001 as failed and confirmed 0002–0006 as printed before archival. Newer receipt work remained active. See `docs/mealdeck-receipt-retirement.md` for the guarded operation and readback.

## Staff cash orders and explicit meal contents — latest owner decisions, 6 November 2026

- The owner authorised manual walk-in cash orders in Operations. Require current verified staff identity, enrolled MFA and `payments.collect` for the configured kitchen. Printer-only access does not grant cash collection. The first release is pickup only, with mandatory real customer name and phone, current canonical menu choices/prices/stock, optional notes and an explicit exact-total Cash received attestation.
- Cash payment authority comes from the immutable scoped tender and staff audit, linked to the canonical order and quote. Do not fabricate a Stripe event, customer account or email. Preserve all existing card/shared/Terminal authority and historical amounts. A confirmed cash order receives the next ordinary sequential number, then awaits staff acceptance; accepting on either KDS or printer creates the same unique original receipt.
- Save the scoped quote/attempt identifiers before confirmation and recover that exact pair after an uncertain response. Status, confirmation and unused-quote closure share locks. A committed order wins a close/confirm race. Only a validated server `cancelled: true` may clear an unused attempt; closing it creates no order, cash tender, refund or number. Keep current staff authorization on recovery and closure. Never erase unresolved recovery after a timeout or quote expiry.
- Meal inclusions use frozen stable SKU/modifier identities, not editable names. Show the actual included fries/selected side and drink, quantity, peri salt and named replacements without adding a price or duplicating the replaced component. Unknown historical selections retain their purchased text without an invented summary. Apply the guarded meal projection after the cash extension; preserve existing receipt payloads, print evidence and payment/packing/readiness gates.
- The dedicated Android printer companion remains a proposed build until the exact device/service, official compatible SDK and signed-device acceptance are available. Keep the PWA as the operator screen and printer-only permissions separate from payments. See `docs/mealdeck-android-printer-bridge-plan.md`.
