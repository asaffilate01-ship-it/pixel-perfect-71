# Independent MealDeck Cloud deployment — 4 November 2026

## Completed

These are the provisioning results recorded by Lovable. The managed-installer source update below does not apply SQL or independently recheck the hosted database.

- Provisioned a fresh, dedicated Lovable Cloud backend for this project; no external backend connection prevented provisioning.
- Confirmed PostgreSQL 17.11, zero public application tables and no confirmed Auth account matching the intended owner at inspection time.
- Current source includes merged PR #67.
- Generated `deploy/mealdeck/generated/install.sql` from the reviewed phase-47 builder: nine sources, one transaction, 190403 bytes; SHA-256 `1f6f09e3057ca71bb60b646173d1ab48f7b0a0ef7bdbdbcd3bcf7abd724df8cf`.
- Saved `MEALDECK_SUPABASE_URL` and `MEALDECK_SUPABASE_PUBLISHABLE_KEY` from the same newly provisioned backend. No cross-project fallback was introduced.
- Enabled email/password authentication without disabling email confirmation.
- Public ordering remains coming soon; no checkout approval or payment-release authority was configured.
- Existing `/ops` and `/kds` staff sign-in screens render without browser runtime errors. This is not an authenticated administration acceptance check.

## Installation pending — managed transaction mode available

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

## Remaining acceptance

- Submit the complete managed installer in one atomic migration, then verify database integrity and permissions.
- Confirm the owner account, perform the private bootstrap and configure actual tenant/kitchen bindings.
- Authenticated `/ops` checks: menu editing, draft routing, recipes, stock and staff permissions using approved inputs/prices.
- Authenticated `/kds` must report setup required until accepted independent payment-release authority exists; never fabricate paid orders for testing.
- The owner has now approved the initial £20 item and upgrade prices. Allergen completion, catalogue publication and real payment integration remain pending.

## Payment provisioning — 5 November 2026

- The owner confirmed enabling built-in Stripe payments in test mode. The enable tool reported successful test-account provisioning and registration of the test webhook endpoint.
- Provisioning is not checkout acceptance: no payment products, checkout form or app webhook handler have been created in this request. Illustrative menu prices must not become payment products.
- Food is ineligible for full merchant-of-record compliance handling. Planned checkout uses tax calculation and collection only (`automatic_tax`), with appropriate product-specific tax codes; the seller remains responsible for registration, filing and remittance.
- The owner subsequently approved £20 for every launch item and each chargeable add-on, meal or upgrade. The repository now includes the reviewed draft catalogue import and upgrade-price administration extension. Next requirements are hosted installation, canonical publication and verified order/payment reconciliation. Existing coming-soon, checkout-approval and KDS-release gates remain unchanged.
- Live payments additionally require account claim/onboarding and the payment integration's readiness checks; completing those does not replace MealDeck's own launch acceptance.

## Account access — 5 November 2026

The owner confirmed that this MealDeck project is on a separate Lovable account. The currently available Lovable connection returns `404 project_not_found` for the recorded MealDeck project; the available Supabase connection exposes Dishbee only. No hosted installation, owner bootstrap, catalogue import or payment activation was performed through those connections. Repository changes and local verification do not establish that these changes are published or installed in the owning account. See [the launch-price phase record](mealdeck-launch-prices-and-polish-phase49.md) for the completed source work and remaining runtime contracts.
