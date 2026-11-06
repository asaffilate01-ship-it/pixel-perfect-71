# Independent MealDeck Cloud deployment

## Latest published verification — 6 November 2026

This section records the live review after the following releases were merged and
published. The earlier time-stamped records below remain historical evidence.

| Release | Merge commit | Verified release state |
| --- | --- | --- |
| [PR #88](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/88) | `86ce81b` | Merged and published |
| [PR #89](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/89) | `5b83813` | Merged and published |
| [PR #90](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/90) | `ad987396` | Merged and published; all 15 web/PostgreSQL jobs passed |
| [PR #91](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/91) | `5bcf463` | Merged and published; compact KDS toolbar, printer sign-in recovery and 9–13 November loyalty wording verified live |
| [PR #92](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/92) | `a79d34c` | Merged and published; delivered KDS bundle verified at 12:37:56 UTC with stage tabs outside the hidden tools panel |

Native Android/iPhone compilation remains a separate verification outcome. The
15 web/PostgreSQL results do not establish a native build, signed installation,
phone payment or physical receipt print.

### Public menu and guest entry now work

The live `https://mealdeck.co.uk/api/public/menu` returned **HTTP 200 with 77
items**. The browser displayed **“Prices and availability are updated from the
kitchen.”** This supersedes the earlier `503 menu_unconfigured` observation. The
current count is the filtered public projection; source catalogue totals and
visible counts can differ under publication, routing and required-choice rules.

The reviewed modifier-price prerequisite and category/add-on editing extension
were installed, followed by
`20261106115120_mealdeck_public_menu_read.sql`. The new no-argument
`mealdeck_public_menu()` resolves the installed MealDeck scope internally and
returns reviewed source keys and public menu fields only. Its anonymous read is
independent of checkout credentials. The raw scoped catalogue remains
service-role only, and no direct menu, customer, staff or payment table access was
granted. See [the public menu read contract](mealdeck-public-menu-read.md) and
[category/add-on editing](mealdeck-menu-structure-editing.md).

The live basket was checked with **The Ace £3.99 + Cheese Slice £0.50 + meal
upgrade £2.50 + included Pepsi = £6.99**. This verifies the displayed basket
subtotal and selected choices. Choosing **Collection** opened the guest name and
WhatsApp-number fields without a member-login step. Checkout remained disabled
because the hosted checkout status was unavailable; this was not a completed
canonical quote, payment or order.

### Printer access and paid-test readiness

Read-only database checks at approximately **12:00–12:02 UTC** found an active
MealDeck Luton kitchen, checkout and channel switches enabled, operator state
**Online**, a **30-minute** collection estimate, and pickup/kerbside fulfilment.
The public database status correctly remained closed before the 15:00 opening
while returning the configured kitchen and an upcoming opening offer.

The dedicated **`printer@mealdeck.co.uk`** account has an enabled Luton printer
assignment, but its Auth email is **unconfirmed**. It therefore does not yet meet
the printer's verified-identity requirement. The existing verified global owner
has canonical `staff.manage` permission and meets the deployed
`printer_can_manage` checks; that owner can use `/printer` after normal sign-in
without a separate printer assignment. The dedicated account needs its normal
email-verification flow completed.

A later read-only check at **12:39:52 UTC** supersedes that account blocker:
`printer@mealdeck.co.uk` is now email-confirmed and has an enabled assignment for
the active Luton kitchen. It has no Operations role, as intended for the dedicated
printer account; `/printer` uses the separate assignment and does not require
general `/ops` or `/kds` access. The deployed printer identity and scope checks
are satisfied. A successful device session, local bridge pairing and actual
paper output remain unverified.

At that database check there were **zero orders, KDS tickets, receipt jobs and
receipt events**. Queued, claimed, sending, sent-unconfirmed, printed, held and
failed receipt counts were all zero. Ten printer RPCs were installed. There is no
receipt-terminal registry in the database: browser pairing and the local receipt
bridge at `https://127.0.0.1:17443` determine hardware configuration. Device
sign-in, bridge pairing, LAN-printer connectivity and physical paper acceptance
remain to be verified. Receipt printing is separate from Stripe payment Terminal
configuration.

At **12:01 UTC**, `test@mealdeck.co.uk` matched the private approved identity, had
a confirmed Auth email and an existing customer profile, and passed
`launch_test_eligible_at(..., now())`. The fixed window is **6 November
08:00–15:00 UTC**, with 15:00 excluded; the exact-cutoff check returned false.
This establishes database eligibility at that time. A successful hosted LIVE
payment, verified release of one KDS order, staff acceptance and physical receipt
confirmation remain outstanding.

### Hosted checkout fallback: current evidence and next diagnostics

The latest hosted checkout review still returned `available:false`,
`kitchen:null` and an `unscheduled` opening offer. The independently queried
database returned **Online / 30 minutes / upcoming 15:00**, so the public menu
repair does not establish checkout readiness.

The deployed `mealdeck_online_checkout_status(uuid,uuid)` has exactly the requested
`p_tenant` and `p_location` arguments, no defaults, and execute permission for
`anon`, `authenticated` and `service_role`. The private customer wrapper has
exactly `p_tenant`, `p_location`, `p_customer` and remains service-role only. No
function-signature or ACL mismatch was found. The actual database response passes
the current kitchen and opening-offer contracts.

Missing service or Stripe credentials, an unsigned-off integration, a disabled
online flag or invalid Checkout-domain configuration can keep `available:false`,
but a successful status read preserves the kitchen and opening offer. This GET
does not make a Stripe network request. A read-only unmatched-scope probe also
returned an **upcoming** offer because the installed `opening_offer` uses the
fixed launch window. The full **unscheduled** fallback therefore points to a
runtime-configuration failure before the RPC, a failed public RPC request, or an
invalid response. Missing or conflicting tenant/location settings are a leading
inference; their exact hosted presence has not been observed.

Continue diagnostics in this order:

1. Confirm the served revision and retain the successful no-argument public-menu
   response as evidence that the explicit MealDeck public connection can read
   PostgREST. `/kds` initialization alone does not validate checkout scope.
2. In the owning hosted configuration, check the presence, UUID format and
   consistency of `MEALDECK_TENANT_ID` / `MEALDECK_LUTON_TENANT_ID` and
   `MEALDECK_LUTON_LOCATION_ID` against the actual installation and active Luton
   kitchen. Every configured tenant alias, including a St Albans alias, must
   agree; Luton and St Albans location IDs must not be identical. This is a scope
   check, not evidence that any particular variable is absent.
3. If scope is valid, inspect the public status RPC's HTTP/error code and confirm
   its request contains exactly the two server-selected argument names above.
   Distinguish configuration rejection, transport/API failure and response
   validation. Record the failing stage and sanitized code without credentials,
   bearer tokens or private payloads. The schema signature and database grants
   have already been checked.
4. Once the hosted status returns the actual kitchen and schedule, use the
   authorized integration diagnostics to verify service-key binding, LIVE Stripe
   configuration/account/webhook readiness and the applicable approval gates.
   The approved account's bounded prelaunch access and public release sign-off
   remain separate. Perform the real paid-order/printer acceptance through the
   normal authenticated flow; only verified payment may release the order to KDS.

## Earlier activation check — 6 November 2026, 00:10 UTC

Read-only inspection of the dedicated MealDeck project at `2026-11-06 00:10:59 UTC`
found zero Auth accounts for the intended owner `info@mealdeck.co.uk`, zero verified
intended-owner accounts, zero tenants, zero kitchens, zero operational menu items
and zero orders. This does not describe unrelated Auth users or establish that
every hosted secret is absent. The verified owner, private kitchen bootstrap,
reviewed catalogue and payment commissioning remain required before accepting
customer orders.

The native Android/iPhone staff app and shared-payment implementation were merged
and published through PR #75. The branded Checkout domain support and private
owner/admin payment/email diagnostics were merged and published through PR #76.
The domain migration `20261105194218_mealdeck_checkout_domain.sql` was installed
atomically; its SHA-256 is
`be73c0bde631a8a694e14219ca9291a03b98507c488c8b2a6a09eed203ed537b`.
Both native compilation jobs passed in
[Verify MealDeck run 767](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42098744053).
Those jobs build an Android debug APK and an unsigned iPhone simulator target;
they do not establish signed distribution, Apple entitlement approval or a real
phone payment. The native app already includes Apple's How to Tap education
bridge and the server-owned payment recovery flow.

On 6 November the owner reported that Stripe DNS/custom-domain setup was live.
An unauthenticated HTTPS request to `https://pay.mealdeck.co.uk` returned 204.
This is a reachability observation, not a verified merchant-domain status or a
completed Checkout Session. Hosted use still requires the exact server setting
`MEALDECK_STRIPE_CHECKOUT_HOST=pay.mealdeck.co.uk` and an approved end-to-end
provider check. No real charge or email was sent as a probe.

The requested replacement for the old reply-link planner is documented in
[group ordering](mealdeck-group-ordering.md). Its release adds service-owned rooms,
single-use invitations, a three-minute join window, named frozen bags, own-item
or organiser payments and one kitchen release after full verified funding. The
additive migration is `20261105235509_mealdeck_ordering_rooms.sql`; install its
complete guarded transaction after the existing shared-payment/domain extensions.
Local release validation passed 899 Bun tests, 20 PostgreSQL behavior checks,
27 receipt-bridge tests, production build, TypeScript and scoped lint. The release
workflow additionally runs eight native PostgreSQL concurrency cases and both
native app builds. Its release PR records the exact CI, hosted migration and
publication results; these local checks alone do not establish live activation.

## Earlier installation record — 5 November 2026

### Foundation installation

Access to the correct MealDeck Lovable project `2184585f-d92c-4d42-b25b-b7f87f98d0d8` is restored. Read-only inspection confirmed PostgreSQL 17.11, zero public application tables and zero Auth users before installation. The Supabase connector still lists Dishbee only; it was not used for MealDeck writes.

The Lovable query connection was first checked with an explicit transaction creating a temporary probe table, rolling back, and verifying that the table did not exist. It confirmed explicit transaction rollback. The **unchanged standalone installer** (190403 UTF-8 bytes, SHA-256 `1f6f09e3057ca71bb60b646173d1ab48f7b0a0ef7bdbdbcd3bcf7abd724df8cf`) was then submitted as **one complete request with its own `begin;` / `commit;`**. This uses the authorised standalone execution contract; the managed/autocommit body was not used.

The request succeeded. A separate read verified installation marker `mealdeck-independent-v1`, installation ID `1c2a5fca-bac5-4c51-b406-7bd81612f51a`, installed at `2026-11-05T08:27:55.786623+00:00`, 42 public tables, RLS enabled on every public table, and no direct public-table grants to `anon`, `authenticated` or `service_role`.

No Auth users or businesses exist yet. `info@mealdeck.co.uk` must register and verify its email before the existing private owner bootstrap can assign ownership. No account was invited, automatically verified or granted access. No catalogue was published and no orders, payments or KDS tickets were created by this installation.

The separate customer membership extension was also applied atomically and verified: five private customer tables all have RLS, the customer profile RPC is unavailable to `anon` and available to authenticated users, and no public owner-bootstrap RPC was introduced. Its public capability response confirms registration availability, with push sending and loyalty earning still disabled pending configuration. No customer account, email or order was created by the installation.

The owner's latest detailed prices for **Skorch, Tavo, Load’d, Moktl and Souvano** supersede the £20 placeholders discussed in the historical records below. The current source catalogue contains 79 items; Souvano's three mains are £6.50, £6.99 and £9.99 including fries/rice/naan. The reviewed price revision checks old values and preserves unrelated administrator edits. Milkshake upgrades retain the supplied £2.99 price but remain unavailable until flavour choices are supplied. The owner subsequently confirmed opening on 6 November, 15:00–23:00, and 7–8 November, 13:00–23:00, Europe/London, with guest ordering and no guest loyalty points. See the [confirmed opening guide](mealdeck-opening-guest-checkout.md); these dates supersede earlier unscheduled campaign notes.

### Checkout, kitchen and printer installation — 09:38 UTC

The complete release source is in [PR #70](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/70), implementation commit `e6968308f4ec4c4f779027ebdb745a38183b6d57`. All seven jobs in [Verify MealDeck run 729](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42003738119) passed before the following database writes. Native PostgreSQL 17 verified 19 checkout groups, including simultaneous kitchen-scoped handoff-code allocation, and 16 kitchen/printer groups, including competing terminal claims. Local checks also passed 674 unit tests, 23 bridge tests, the production build, TypeScript validation and responsive browser flows.

Each unchanged additive migration below was submitted to the same MealDeck Lovable project as **one complete query with its own outer transaction**. Both returned success, followed by independent read-only verification. The historical foundation installer was not rerun or edited.

| Migration                                     | UTF-8 bytes | SHA-256                                                            |
| --------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `20261105082900_mealdeck_stripe_checkout.sql` |      44,646 | `d526795e1d691c4f14936191b4cf1b7a4c4c8c6fa2b8d695d54410fe65bd681e` |
| `20261105090147_mealdeck_kitchen_printer.sql` |      39,573 | `3a6662a3361e9dbe45d71f93044a7a72f8a0c7e07deb1ed8b4b33dd94595c9fc` |

At `2026-11-05 09:38:16.468866+00`, hosted verification confirmed:

- All seven new checkout/printer tables have RLS; no public application table has RLS disabled.
- No direct public/extension-table grants exist for `anon`, `authenticated` or `service_role`.
- Anonymous callers cannot read the printer queue or claim a receipt. Authenticated callers can reach the narrow RPCs, which independently enforce verified identity and the assigned kitchen. Service API credentials cannot use the staff printer queue.
- Authenticated customers cannot execute the private owner bootstrap. Own-order history is authenticated only.
- There are still **zero Auth users, businesses, orders and receipts**. Installation created no merchant/customer account, order, captured payment or physical print.
- Registration is available. Push sending and loyalty earning remain disabled pending their configuration.

The installed schema and merged/published source are distinct from live ordering activation. The next required input is the intended owner's verified account, `info@mealdeck.co.uk`, followed by private owner/kitchen bootstrap and reviewed catalogue publication. Server-only Stripe credentials, account/mode/webhook settings, release acceptance and pickup estimates still need their real configuration. The printer requires a compatible device, local bridge/TLS setup and a physical paper check. See the [checkout guide](mealdeck-opening-checkout.md), [customer guide](mealdeck-customer-membership.md) and [kitchen/printer guide](mealdeck-kitchen-printer.md).

### Confirmed hours and guest checkout installation — 15:10 UTC

The guest release source is in [PR #71](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/71), implementation commit `71ea6697b14766f1cd239c463f32ffbab2ff9297`. All eight jobs in [Verify MealDeck run 735](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42051399322) passed before installation, including the native PostgreSQL 17 guest suite and its concurrent service-connection case. Local validation passed 690 unit tests, 23 receipt-bridge tests, TypeScript, scoped lint and production build. Local responsive browser review was blocked by the preview host allowlist; no visual browser pass is claimed for that environment.

The unchanged `20261105143652_mealdeck_opening_guest_checkout.sql` (36,303 UTF-8 bytes; SHA-256 `e243e1347ec8bea697eac34dffd79e4effffd517b186ad540bfc141cd1711675`) was submitted to the same verified independent MealDeck project as one complete request with its own `begin`/`commit`. It succeeded. Historical installers were not rerun.

At `2026-11-05 15:10:28.725356+00`, a separate read-only query verified all security and window invariants: nineteen routine definitions and access policies, thirteen relevant table RLS/ACL checks, all 42 public tables protected, identity/scope constraints, fifteen exact opening-time boundaries, and the original server-clock wrapper using `now()`. Guest RPCs are available only to the service role; no direct API-role table grants were introduced. The configured campaign starts 6 November at 15:00 and ends 8 November at 23:00, Europe/London, with nightly closure. The fixed-date default is present.

The same verification found zero Auth users, owner accounts, businesses, orders, receipts, guest sessions, quotes, Stripe records, customer profiles, consent entries, loyalty entries or push subscriptions. Checkout settings remain disabled/unbound; push and loyalty remain disabled. Installation did not create an owner, customer, payment or print. Owner verification and real checkout activation are still required. The later Online/Busy/Pause/Closed addition is tracked separately below when installed.

### Online / Busy / Pause / Closed installation — 15:21 UTC

The admin availability addition is implementation commit `7973feda911f1dd55dd700d0eb086f08b5a2daa5` in the same PR #71. All nine jobs in [Verify MealDeck run 737](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42053777999) passed before installation. Native PostgreSQL 17 passed all 16 availability groups, including concurrent audit changes, an ETA update waiting for payment preparation, and an estimate-only save waiting behind another admin's Pause. The completed application passed 693 local unit tests with 5,813 assertions, production build, TypeScript and scoped lint; the receipt bridge's 23 tests also passed.

The unchanged `20261105150406_mealdeck_kitchen_availability.sql` (15,352 UTF-8 bytes; SHA-256 `dc9d88fe6f7abe7ebbdde3c69bfcc7c1ad00bc2da9c6eaa80d06d41ea1fbabc0`) was submitted as one complete query with its outer transaction to the same verified independent MealDeck project. The request succeeded.

Independent verification at `2026-11-05 15:21:37.306427+00` confirmed the Closed default, state/enabled consistency constraints, hardened routine grants, RLS and two INSERT-only admission guards. Both new admin write RPCs are authenticated-only and enforce verified owner/admin kitchen authority; anonymous and service API roles cannot use them. The runtime still uses the original server clock and the confirmed launch windows. Unbound public status returns ordering closed, guest checkout ineligible and no invented kitchen estimate.

A separate full guest/security verification at `2026-11-05 15:21:38.693227+00` passed again after the availability installation. All 42 public tables retain RLS and no direct grants to `anon`, `authenticated` or `service_role`. Auth users, businesses, orders, receipts, guest sessions, payment records and customer/consent/loyalty/push records remain at zero; no checkout was enabled. Push and loyalty remain disabled. The state controls are available in source on admin Overview and Finance; using them on the hosted project still requires the intended owner's verified account and real kitchen setup. See the [availability guide](mealdeck-kitchen-availability.md).

### Published source and live review — later on 5 November

The hosting project follows the historical branch `feature/dishbee-play-food-cards`, not `main`. A normal merge preserved its independently generated database types and the approved launch release at `052c621692a9c4c9ee9e44ac243f4edc370f6105`. Both branches were aligned without rewriting history. Native publication then exposed the updated opening hours, guest/member 30% terms and collection/kerbside guide at `https://mealdeck.co.uk/meta-ad`.

The games redesign was merged through [PR #72](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/72) as `f2347fc727ac00d1dd5efc53b93595ab1ca8bf8c`. All nine checks passed on the PR and the merged [main workflow](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42075057525). The hosting branch was fast-forwarded to the same revision, Lovable reported that source ready, and native deployment `3e6e5a32-4cac-46f3-a6a5-2a4401251fb2` was requested. The public `/play` page was then reloaded and visibly verified with the new searchable library and cream/paper layout. Desktop interaction covered 2048 start/move feedback, search preserving an active round, Food Pairs reveal/mismatch, Recipe Rush completion and next-action focus, and Order Echo untimed play/pause/resume/round progression. Actual phone and multiple-viewport checks remain outstanding; the managed local preview host is blocked and the native preview requires dashboard sign-in.

The three-offer publication was merged through [PR #73](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/73) as `9d9e1197932a02b8075b5e9a92346d0fbbf8af28` after successful CI on implementation `37bbfa61e92d433cd3e73665aa97b5ef349b3200`. The hosting branch was aligned, its ready source verified, and native deployment `99a149fe-3aaf-48d7-8957-bf1994948480` requested. Once deployment completed, the public `/offers` page was reloaded and visually checked: exactly the 30% entire-menu offer, Sunday 99p milk cake and registered £15/2× points offer, with the supplied dates and current header/footer navigation. The combined local suite passed 716 tests with 5,810 assertions, TypeScript and production build. Public promotion details do not activate cake pricing or loyalty awards; their missing setup is recorded in [the offers guide](mealdeck-offers-20261105.md).

The same live-site review confirmed that `/menus` displays the approved prices and `/account` exposes registration with separate optional marketing preferences. `/checkout` correctly reports ordering unavailable and keeps delivery disabled. A new read-only inspection of the independent database still found **zero Auth users**, no intended-owner account or verification, and no bootstrapped business. No ownership, paid checkout, catalogue publication, loyalty delivery or physical printing was activated during this review.

Group audit found reserved tables and historical payment decision models, but no create/join invitation RPC or installed group-payment authority. The host-pays group preparation flow is therefore separate from future server-synchronised groups and split settlement. See the current [build and launch checklist](../roadmap.md) for the remaining concrete setup and acceptance work.

The following sections retain the earlier provisioning and investigation record. Their “installation pending” and “connector unavailable” observations are superseded by the verified position above.

## Historical provisioning record — before the current installation

These are the provisioning results recorded by Lovable. The managed-installer source update below does not apply SQL or independently recheck the hosted database.

- Provisioned a fresh, dedicated Lovable Cloud backend for this project; no external backend connection prevented provisioning.
- Confirmed PostgreSQL 17.11, zero public application tables and no confirmed Auth account matching the intended owner at inspection time.
- Current source includes merged PR #67.
- Generated `deploy/mealdeck/generated/install.sql` from the reviewed phase-47 builder: nine sources, one transaction, 190403 bytes; SHA-256 `1f6f09e3057ca71bb60b646173d1ab48f7b0a0ef7bdbdbcd3bcf7abd724df8cf`.
- Saved `MEALDECK_SUPABASE_URL` and `MEALDECK_SUPABASE_PUBLISHABLE_KEY` from the same newly provisioned backend. No cross-project fallback was introduced.
- Enabled email/password authentication without disabling email confirmation.
- Public ordering remains coming soon; no checkout approval or payment-release authority was configured.
- Existing `/ops` and `/kds` staff sign-in screens render without browser runtime errors. This is not an authenticated administration acceptance check.

## Historical installer investigation — managed transaction mode

The available `lov_database.migration` interface requires SQL **without transaction-control statements** and owns its transaction and migration journal. The initial attempt stopped because the default standalone installer owns its outer `begin;` and `commit;`. **No installer SQL was submitted or applied.**

The reviewed builder now provides an explicit managed mode for this execution contract. It removes only its own two outer transaction-control lines, leaves all canonical SQL unchanged and requires the runner to execute the entire file as **one atomic migration**. The original standalone installer remains unchanged: 190403 bytes, SHA-256 `1f6f09e3057ca71bb60b646173d1ab48f7b0a0ef7bdbdbcd3bcf7abd724df8cf`.

The next Lovable step, using the updated repository source, is:

```sh
node deploy/mealdeck/build.mjs --managed-transaction --check
node deploy/mealdeck/build.mjs --managed-transaction --out deploy/mealdeck/generated/install-managed.sql
```

The managed output is 190662 bytes, SHA-256 `23cb86413ff2f5cfab50fad078224411355bb1f6409c406c7638cfe1cd71ddbb`. Read that complete file and submit its contents unchanged to **one** `lov_database.migration` call. The tool must begin its own transaction before the first statement, commit only after all SQL and migration bookkeeping succeed, and roll everything back on failure. Do not use an autocommit query tool, split requests, run historical migrations separately, weaken the fresh-project guard or add a privileged browser/service RPC. If the tool rejects the full migration or its bookkeeping conflicts with the fresh guard, report that exact blocker for review.

After the migration succeeds, record its receipt and verify the installation marker, expected application tables/RPCs, restrictive grants and RLS before owner bootstrap. Until that result is recorded, the status remains **database provisioned; application schema installation pending**. Source tests verify managed-body equality and rollback in a real local PostgreSQL transaction; they do not establish hosted installation.

## Owner and kitchen

The owner confirmed `info@mealdeck.co.uk` as the intended admin account and `MealDeck` as the actual shared kitchen name. A confirmed Auth account must exist and its exact UUID must be verified before the private owner bootstrap is run. No Auth account was created, invited or automatically confirmed; no ownership was assigned.

After successful schema installation and account verification, use the documented private bootstrap once to create the five draft brands, one kitchen/station, one owner assignment and disabled ordering channel. Store its actual returned UUIDs in the deployment record; do not infer city-to-kitchen bindings.

## Historical acceptance checklist — superseded by the current position above

- Submit the complete managed installer in one atomic migration, then verify database integrity and permissions.
- Confirm the owner account, perform the private bootstrap and configure actual tenant/kitchen bindings.
- Authenticated `/ops` checks: menu editing, draft routing, recipes, stock and staff permissions using approved inputs/prices.
- Authenticated `/kds` must report setup required until accepted independent payment-release authority exists; never fabricate paid orders for testing.
- The owner has now approved the initial £20 item and upgrade prices. Allergen completion, catalogue publication and real payment integration remain pending.

## Historical payment provisioning — 5 November 2026

- The owner confirmed enabling built-in Stripe payments in test mode. The enable tool reported successful test-account provisioning and registration of the test webhook endpoint.
- Provisioning is not checkout acceptance: no payment products, checkout form or app webhook handler have been created in this request. Illustrative menu prices must not become payment products.
- Food is ineligible for full merchant-of-record compliance handling. Planned checkout uses tax calculation and collection only (`automatic_tax`), with appropriate product-specific tax codes; the seller remains responsible for registration, filing and remittance.
- The owner subsequently approved £20 for every launch item and each chargeable add-on, meal or upgrade. The repository now includes the reviewed draft catalogue import and upgrade-price administration extension. Next requirements are hosted installation, canonical publication and verified order/payment reconciliation. Existing coming-soon, checkout-approval and KDS-release gates remain unchanged.
- Live payments additionally require account claim/onboarding and the payment integration's readiness checks; completing those does not replace MealDeck's own launch acceptance.

## Historical account-access interruption — 5 November 2026

The owner confirmed that this MealDeck project is on a separate Lovable account. The currently available Lovable connection returns `404 project_not_found` for the recorded MealDeck project; the available Supabase connection exposes Dishbee only. No hosted installation, owner bootstrap, catalogue import or payment activation was performed through those connections. Repository changes and local verification do not establish that these changes are published or installed in the owning account. See [the launch-price phase record](mealdeck-launch-prices-and-polish-phase49.md) for the completed source work and remaining runtime contracts.

## Historical repository and public-site observation — before this release

Connected-branch commits `9393bf9` and `a4a4aab` add a separate production **live-mode publishable** payment key and MealDeck logos to basket/checkout headings. The development key retains its test-mode prefix. Neither value is printed in this record. The application still has no consumer of `VITE_PAYMENTS_CLIENT_TOKEN`; these commits add no payment SDK, server session, webhook, database installation or release adapter. A key's prefix identifies its mode, not merchant readiness or successful payment processing.

The live `/menus` and `/order` pages were reloaded and still rendered the coming-soon launch menu, with prices not yet displayed at that observation. `/luton` also retained the global ordering-coming-soon status, while `/st-albans` and `/bedford` explicitly remained coming soon. Repository merge and Lovable publication remain distinct. The owner confirmed Luton-only launch scope and requested walk-in/kerbside Tap to Pay; [the in-person payment contract](mealdeck-in-person-payments.md) records the native/reader distinction and required order integration.
