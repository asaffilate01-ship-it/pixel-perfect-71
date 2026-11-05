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

## Launch prices, membership and Stripe — latest owner decision, 5 November 2026

- **Luton is the only launch location.** St Albans and Bedford remain coming soon. Walk-in, pickup and kerbside payment work is for the authorised Luton kitchen; future location configuration must not accidentally enable ordering elsewhere.
- The owner requested Stripe Tap to Pay for walk-in and kerbside customers. Direct phone acceptance requires a supported native Terminal integration; the existing PWA can alternatively control a supported reader through the backend. Follow `docs/mealdeck-in-person-payments.md`; preserve one order/payment and one shared KDS release, and never charge an already-paid collection again.
- The owner's detailed **Skorch, Load’d, Moktl, Tavo and Souvano menu/prices supersede every £20 placeholder**. Use the current shared launch catalogue as the supplied menu record, integer pence throughout, and the exact Tavo flavour/portion matrix. Skorch and Load’d chicken nuggets cost £4.00; Tavo's cost £3.50. Their drinks lists and burger add-on prices also differ. Souvano has three mains: Stir-Fry Doner £6.50, Heatwave £6.99, Middle Eastern flavour Lamb Chops £9.99, each including fries/rice/naan. Souvano's doner also requires a flavour choice. Do not restore its older unpriced drinks or assumed meal surcharge.
- Meals cost £2.50; replacement fries £2.99, mac £3.99, mocktail/milkshake £2.99, peri salt £0.50. Charge a named cross-brand replacement once. Included can/water choices use that brand's listed £1 range; Red Bull remains a separately priced product. Do not invent milkshake flavours or rewards rates.
- Opening weekend: **30% off everything, no minimum, three consecutive UK calendar days, Luton collection/kerbside only, registered email-verified customers**. The owner has not supplied the dates; do not infer a start date or create a rolling personal countdown. Marketing consent, app installation and browser notification permission must not be offer requirements.
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
