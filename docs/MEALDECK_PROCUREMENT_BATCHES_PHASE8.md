# MealDeck Phase 8 — Suppliers, purchasing, receiving and batch traceability

**Source committed in MealDeck GitHub, not Lovable.** This is an internal operations feature stacked on Phase 7's unmerged staff/recipe/finance work. No production database migration, live supplier ordering, procurement spend, stock adjustment, bank payment or KDS release has occurred.

## What Phase 8 actually builds

### Supplier management

A global finance manager can register or pause a supplier with a name, optional email and expected lead time. Staff with access to only one kitchen may read supplier names for that kitchen's purchase orders; only authorised finance roles can read supplier contacts. **Bank details and provider API secrets are deliberately not part of the supplier record.**

### Two-person purchase approval

The operator creates a **draft PO** for a specific Dishbee tenant/location and an approved supplier. Each draft line is a canonical ingredient, number of packs, base units per pack (grams, millilitres or each), and a net pack price in pence.

The database enforces the lifecycle:

    DRAFT → SUBMITTED → APPROVED → PARTIALLY RECEIVED → RECEIVED
       ↘ CANCELLED  ↗

- Drafts cannot be submitted without at least one ingredient line.
- A purchase can be approved only by a separately authenticated **global finance manager who did not create it**. The creator cannot self-approve, even if an owner.
- The system does not email a supplier, create a bank payment or reserve Adyen funds; "approved" is an internal authority state, not proof the supplier received the order.
- A submitted or draft PO may be cancelled; receipts are rejected unless it is approved/partially received.

### Receiving, lots and inventory

After physical delivery, an authorised inventory operator records the supplier delivery-note reference, PO line, base quantity, printed batch/lot code and expiry type/date. The protected database function locks the PO, verifies tenant/location/ingredient identity, rejects overreceipt and writes these **in one PostgreSQL transaction**:

1. One delivery receipt (unique supplier delivery-note reference **per PO line**)
2. Lot provenance and received quantity
3. Updated PO line and master PO receiving state
4. Positive canonical MealDeck ingredient-stock movement
5. Actor-stamped audit entry

A repeated receipt with the exact same reference, quantity and lot returns the previous receipt ID, **not more stock**; conflicting retries fail.

Each lot may also receive an authorised production, waste or stock-correction issue. The issue uses a unique reference so double-clicks/retries cannot deduct the lot or the stock ledger twice. Over-issue is refused. Production issue from a past-use-by lot is refused by this new function. **Other historic inventory/KDS paths are not automatically blocked**, so operations must still quarantine unsafe food physically.

### Expiry and traceability

The staff console shows:
- Expired use-by items needing immediate quarantine and review
- Best-before items past the stated quality date needing separate assessment
- Lots with dates due in 14 days
- Tracked lot receipt, issue and remaining quantities

**Not a complete stock count:** existing pre-Phase-8 stock adjustments, kitchen deductions, warehouse transfers and supplier returns are not retroactively attributed to new lots. This view reports only tracked lot movements. Food-safety staff must reconcile legacy stock, monitor temperature/recall events and verify allergen controls.

### Finance truthfulness

Supplier purchase lines display quoted goods value only to roles with permission to see ingredient costs. PO costs exclude VAT, delivery, discounts, packaging, allocations and refunds. Nothing is posted to a bank account, supplier invoice or settled merchant statement, and no realised profit is computed by this phase. Do not treat a PO or received inventory as a booked expense without actual supplier invoice and accounting evidence.

## Source files

- `supabase/migrations/20261102202500_mealdeck_ops_procurement_batches.sql` — new additive RLS-backed supplier, PO/line, batch, receipt and lot-issue tables and permission-checked RPCs.
- `src/lib/mealdeck-ops-procurement.ts` and `src/lib/mealdeck-ops-procurement-types.ts` — strict quantity/expiry/approval display helpers, not a second payment authority.
- `src/components/ops/procurement-panel.tsx`, `src/components/ops/stock-batches-panel.tsx` — premium internal supplier, approval, receiving, expiry and lot-issue UI.
- `src/routes/ops.tsx` and `src/lib/mealdeck-ops-access.ts` — permission-gated staff areas: Purchasing and Stock batches.
- `tests/mealdeck-procurement.test.ts` and the CI workflow: quantity and expiry regressions, SQL/RLS/role/idempotency source contract checks.
- `verification/mealdeck-procurement-staging.mjs` — **opt-in, non-production only** real SQL lifecycle and concurrent receipt acceptance.

### Required role matrix

| Activity | Minimum existing Phase 7 permission |
| --- | --- |
| View PO for a specific kitchen | `inventory.read` or `finance.read` |
| Read supplier contacts, pack costs | `finance.read` / `costs.read` |
| Add global supplier | Tenant-global `finance.manage` |
| Create/submit PO at a location | Location `finance.manage` |
| Approve submitted PO | Tenant-global `finance.manage` AND different Auth user |
| Receive approved goods | Location `inventory.write` |
| See lot expiry | Location `inventory.read` |
| Issue/waste a tracked lot | Location `inventory.write` |

The SQL uses the existing Phase 7 `mealdeck_ops_private.can(tenant,location,permission)` verifier. Browser buttons are not an authorisation boundary. All new tables have RLS enabled and no direct authenticated or anonymous table CRUD grants.

## Production restrictions and migration prerequisites

The SQL file depends on canonical Dishbee tenants, tenant_locations, menu_items, the Phase 7 recipe/ingredient and stock tables, authenticated staff and the Phase 7 permission/audit functions. It must **only** be applied to a verified, authorised Dishbee staging database after replaying all dependencies in order. Do not apply it to an empty MealDeck project.

The connected Dishbee Supabase project was visible in this conversation, but read-only SQL and table-list requests returned **Postgres password authentication failed**. Therefore no live database migration or RLS test could be performed. Re-authorise the connected project's database credentials through the approved connection process, then perform staging replay. Never put a service role key in a browser environment variable or GitHub PR.

No draft PR has been merged into main simply because a source contract test exists; full TypeScript, Bun, SQL replay and RLS integration tests plus rollback need evidence.

## Real PostgreSQL staging acceptance (explicitly opt-in)

This command requires a separately approved **non-production** Supabase project, scoped test tenant, kitchen, ingredient and three synthetic/test authenticated finance/inventory staff JWTs. It creates a synthetic supplier/PO/lot and records staged stock adjustments; it never contacts a real supplier, payment provider or courier. The test intentionally leaves audit history for manual cleanup.

```sh
export SUPABASE_URL='https://<approved-staging-ref>.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='<staging-publishable-key>'
export SUPABASE_SERVICE_ROLE_KEY='<staging-only-legacy-service-role-key>'
export APPROVED_STAGING_PROJECT_REF='<approved-staging-ref>'
export PRODUCTION_PROJECT_REF='<different-production-ref>'
export PROCUREMENT_STAGING_CONFIRM='CREATE-SYNTHETIC-PURCHASE-NO-PROVIDER'
export STAGING_TENANT_ID='<approved-test-tenant-uuid>'
export STAGING_LOCATION_ID='<approved-test-kitchen-uuid>'
export STAGING_INGREDIENT_ID='<approved-test-ingredient-uuid>'
export STAGING_PURCHASER_JWT='<test-purchaser-token>'
export STAGING_APPROVER_JWT='<different-test-finance-admin-token>'
export STAGING_RECEIVER_JWT='<test-inventory-receiver-token>'
npm run verify:procurement:staging
```

The harness checks: independent finance approval, two simultaneous receipts returning the same ID, exactly one positive stock movement, one lot, a repeat issue returning the same ID, one negative movement and no overreceipt. **Not executed yet.**

### Go-live checks

- Full original Dishbee migration chain and Phase 7/8 SQL replay on a disposable staging project; inspect actual database grants and RLS, not just source text.
- Separate tenant A/B and kitchen A/B account tests, kitchen cost masking, no PO approval by its creator, lock concurrency, receipt idempotency, wrong PO/ingredient/supplier rejection.
- Supplier paused/deactivated, unit-price zero/missing, partial goods receipt, last shipment repeat, stock overissue, expired use-by issue, best-before review and inconsistent supplier lot code.
- Check physical stock, FEFO process and recall/expiry handling with an actual trained food operator.
- Browser keyboard/touch responsiveness, full TypeScript/build, lint, Bun tests, staging performance and backup/rollback.
- Verify no supplier email or payment is initiated; reconcile approved PO and receipts to actual supplier invoice and VAT records in the *next* phase.
- Sign-off by owner, finance and food-safety operator before merging to main or enabling any real kitchen changes.

## Next priorities after approval

Supplier invoice upload and three-way PO/receipt/invoice matching; VAT and approved accounting exports; purchase-return and credit-note workflow; warehouse transfers with dual-location audit; batch recall and FEFO consumption integration; automated low-stock/expiry notifications; cost-variance flags; labour and packaging costing; multi-brand royalty and settlement reporting; and reconciliation with Adyen for Platforms, ChefzHub and independent Cafe1 merchants.
