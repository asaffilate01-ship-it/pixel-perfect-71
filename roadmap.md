# MealDeck build and launch status

Last reviewed: **5 November 2026**. This is the current checklist; numbered phase documents retain their historical implementation notes. The hosted installation record is in [the deployment status](docs/mealdeck-cloud-deployment-status.md).

## Completed

- [x] Preserve the approved MealDeck identity, all marketing brand logos and cross-brand menu browsing.
- [x] Publish the five owner-priced launch menus: **79 items in 20 sections**, including Tavo portion/flavour prices, brand-specific drinks and extras, and Souvano's three mains with an included side. The earlier £20 placeholders are superseded.
- [x] Keep one saved basket across brands; itemise every flavour, upgrade, included drink and separately purchased extra.
- [x] Provide mobile menu navigation, a basket sheet, search, undo and accessible customisers.
- [x] Install and verify the independent MealDeck database foundation and incremental customer, checkout, kitchen/printer, guest and availability extensions. Preserve RLS, scoped RPCs and separation from Dishbee/Cafe 1.
- [x] Publish customer registration and email-verification entry, optional marketing preferences and private order/receipt paths. Registration never grants staff ownership.
- [x] Implement and test Stripe Checkout creation and signed, independently verified payment reconciliation. Browser returns cannot mark an order paid or release the kitchen.
- [x] Implement Luton collection and kerbside checkout, final order review, optional cutlery and exact numbered-bag allocations. Delivery remains unavailable.
- [x] Confirm opening hours: **Fri 6 Nov 15:00–23:00; Sat 7 and Sun 8 Nov 13:00–23:00**, Europe/London. Opening-window guest checkout earns no loyalty points.
- [x] Implement the opening 30% discount, no minimum, for eligible guest and member orders during those daily hours.
- [x] Build and install audited **Online / Busy / Pause / Closed** admin controls. Online/Busy retain every readiness gate; Pause/Closed preserve existing payment reconciliation and order progress.
- [x] Build one shared kitchen board across brands, one receipt job on acceptance, protected printer pairing and recovery, and separate KDS/printer alerts.
- [x] Publish the customer, staff and printer PWA identities and privacy-safe offline behaviour.
- [x] Publish the opening guide/advert at `/meta-ad`, current opening hours and the approved Luton address.
- [x] Merge and publish the eleven-game arcade refresh: searchable library, focus view, clearer controls, explicit starts, replay and reduced-motion support. PR #72 and main CI passed; live desktop gameplay was checked.

## Current completion work

- [x] Publish the dedicated Offers page with exactly the three owner-approved November promotions and remove retired sample offers. PR #73 is merged; the live `/offers` page was visually checked after native publication.
- [x] Build the host-pays group flow: invite individual choices, review replies, combine one basket and carry each person's items into numbered bags. Strict restoration, replay protection, stale-tab checks and a fixed authentication return preserve the reviewed group. Split payments remain separate and unavailable. See [the group guide](docs/mealdeck-group-ordering.md).
- [x] Deliver a printable staff preparation/packing guide and individual PDFs for the five confirmed menu brands: 14-page combined guide plus Skorch (3), Tavo Chicken (4), Load’d (4), Moktl (2) and Souvano (2). All 79 items and 19 option groups are covered; all 29 pages were rendered and visually checked. These staff documents do not invent missing recipes or allergen declarations.

## Required before accepting paid orders

- [ ] **Verified owner:** `info@mealdeck.co.uk` must register and verify its email in the independent MealDeck Auth project. Read-only inspection on 5 November still found no Auth users.
- [ ] **Business and kitchen:** use the existing private bootstrap for that verified owner and the confirmed MealDeck kitchen. Record actual tenant/kitchen/station UUIDs; configure only Luton.
- [ ] **Published catalogue:** import the approved 79-item catalogue, apply the expected-old-price revision, review the recipes/allergens, route items to the shared station and publish the available records.
- [ ] **Stripe configuration and acceptance:** configure the actual server-only account, mode, secret and webhook settings; verify captured payment, retry/idempotency, refund/dispute holds and exactly one kitchen release with the owning provider account. Automated fixtures are not live payment acceptance.
- [ ] **Pickup estimate and opening:** set the kitchen's actual estimate, complete the release acceptance, then deliberately enable the server and scoped kitchen settings. Do not bypass missing readiness by changing a public coming-soon label.
- [ ] **Devices:** pair the receipt terminal with a supported printer and confirm one complete physical receipt, paper stop/cut behaviour and distinct KDS/printer sounds. Confirm customer and staff app behaviour on actual iOS/Android devices.

## Remaining commercial and product setup

- [ ] **Milk cake:** approve the exact Icova product, portion, ingredients/allergens and fulfilment details for the **99p offer with every order on Sun 8 Nov**. Add and verify its canonical promotion pricing; advertising the offer does not configure a product.
- [ ] **Loyalty:** confirm the base earning rule, the meaning of the £15 qualifying spend and award/refund rules, then implement and accept **double points for registered customers spending £15 or more by Fri 13 Nov inclusive**. Do not infer a base rate or award points to guests.
- [ ] **Split payments:** implement server-owned group sessions/invites and immutable per-person payment shares, verified provider events, expiry/refund recovery and full-funding kitchen release. Historical group tables and decision models do not provide a functioning settlement integration.
- [ ] **Preparation specifications:** approve missing cooking methods, portion weights, allergen records, Moktl recipes/serving sizes, lamb-chop count and unspecified add-on details. Keep milkshake options unavailable until flavours are supplied.
- [ ] **Additional brands:** supply confirmed operational menus and preparation specifications for the ten remaining marketing brands before publishing them for ordering.
- [ ] **Push delivery:** configure the actual sender and delivery infrastructure, retaining separate optional marketing and order-progress preferences.
- [ ] **In-person payments:** choose a supported staff phone/native Terminal route or reader, then verify staff-assisted payment and duplicate-charge protection. Website keys do not enable phone Tap to Pay.
- [ ] **Future channels:** configure official WhatsApp and phone ordering, aggregator listings, delivery providers and additional kitchens only after their operational and provider setup. St Albans and Bedford remain coming soon.

## Release discipline

Work through the GitHub repository and native publication; do not spend Lovable AI build credits. Preserve all published Git/Lovable history. Verify source, database installation, publication and actual payment/device acceptance as separate outcomes. The historical hosting branch currently tracked by Lovable is `feature/dishbee-play-food-cards`; keep it aligned with the reviewed main release without force pushes.
