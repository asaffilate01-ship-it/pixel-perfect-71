# MealDeck Phase 9 — Supplier invoices, purchasing reconciliation and credits

**Status: source-only GitHub work, 2 November 2026.** No live supplier invoices, payments, HMRC filings, credit refunds, stock issues or KDS tickets have been created. No Lovable use.

## Purpose

The internal MealDeck /ops portal now supports draft supplier invoices, three-way PO/receipt/invoice matching, separate tax-document review, independent finance approval, and supplier credit notes. It uses the existing, authoritative Dishbee tenant, kitchen, supplier and purchasing data from Phases 7 and 8, rather than a second order or payment ledger.

The new **additive** migration is supabase/migrations/20261102214500_mealdeck_ops_invoice_matching.sql. It depends on the canonical Dishbee schema and the earlier MealDeck staff, recipe and purchasing migrations. It has NOT been applied to staging or production. Never run it against a different/empty Supabase project.

## Workflow

1. An authorised kitchen finance user creates a draft supplier invoice against an approved purchase order. The supplier and kitchen are taken from that verified PO.
2. Each invoice line references an existing ingredient PO line and includes physical base-unit quantity, declared supplier net pence, declared supplier VAT pence and an explicit tax category.
3. Submission requires every entered line to total exactly to the invoice header's declared net and VAT amounts.
4. Three-way matching serialises through the purchase-order row. It requires physically received goods for every claimed quantity, rejects quantities already claimed by other matched/approved invoices, and compares invoice net against the PO unit price (1 penny or 1 percent rounding tolerance, whichever is greater).
5. A separate manual tax-document check requires reviewed tax categories. This review is **not** an HMRC VAT determination or proof of recoverable input VAT.
6. A second authenticated, tenant-global finance manager who did NOT create the invoice must approve it. Approval does not initiate a bank/Adyen transfer or an accounting journal.
7. Approved invoices can be corrected with separately approved supplier credit notes. Cumulative approved credits cannot exceed the original invoice's net or VAT components. They do not initiate merchant refunds or cash collection.

Invoice states are draft, submitted, matched, approved or void. Credits are draft, submitted, approved or void. Approved records cannot be silently voided or deleted from the audit trail.

## Role boundaries

Only authenticated staff with finance.read for the selected tenant/location can see invoices and credit-note values. Creating/matching requires location finance.manage. Final approvals also require tenant-global finance.manage, plus a different verified Auth user. Direct table CRUD privileges are revoked; individual public RPCs check the existing private MealDeck role verifier. All three invoice/credit tables have PostgreSQL RLS enabled. Staff actions create actor-stamped audit records.

Browser access requires the approved Supabase **publishable key only**. Never put a service_role key, bank secret or Adyen credential into a VITE_ variable.

## What appears in the financial dashboard

The internal dashboard displays approved supplier invoice net, supplier-stated VAT, unmatched invoice count and approved supplier credit net. These values are **unreconciled accounting evidence**, not a VAT return, cashflow statement, certified P&L or proof of payment.

The database explicitly returns bankPaymentVerified=false, vatReturnVerified=false and accountingPosted=false. Correct supplier VAT treatment, invoices as supporting files, accounts-payable matching, purchase returns, actual bank settlement and accountant sign-off require further evidence and integrations.

## Files delivered

- supabase/migrations/20261102214500_mealdeck_ops_invoice_matching.sql
- src/lib/mealdeck-ops-invoices.ts and src/lib/mealdeck-ops-invoice-types.ts
- src/components/ops/supplier-invoices-panel.tsx
- src/routes/ops.tsx and src/lib/mealdeck-ops-access.ts (protected finance navigation)
- tests/mealdeck-invoice-matching.test.ts and the updated GitHub CI workflow
- verification/mealdeck-invoice-staging.mjs (explicit non-production-only test)

## Staging and merge gates

Before any production merge, an approved staging environment must pass: full migration replay and Postgres schema checks; anonymous/role/foreign-tenant RLS tests; duplicate invoice number and competing claim concurrency; complete supplier PO/goods receipt match; tax category review and separate invoice/credit approvers; zero accidental supplier or merchant payments; TypeScript, Bun, lint and production build; accessible browser workflow; and accountant/security release approval.

The connected Dishbee Supabase project previously reported database password authentication failure, so no SQL test or migration has been run. GitHub Actions also returned verification runs with zero jobs. Those are blockers to declaring the code production-ready.

### Opt-in staging test

The staging harness creates a synthetic supplier, purchase order, goods receipt, invoice and credit note and verifies approvals. It makes NO supplier delivery, Adyen, HMRC, bank or customer order calls. It refuses production project references and retains synthetic records for manually approved staging cleanup.

The harness requires these variables, supplied through a secure test environment, not GitHub issue comments:

    SUPABASE_URL=https://<approved-staging-ref>.supabase.co
    SUPABASE_PUBLISHABLE_KEY=<staging-publishable-key>
    SUPABASE_SERVICE_ROLE_KEY=<staging-secret>
    APPROVED_STAGING_PROJECT_REF=<staging-ref>
    PRODUCTION_PROJECT_REF=<different-production-ref>
    MEALDECK_INVOICE_STAGING_CONFIRM=SYNTHETIC-THREE-WAY-MATCH-NO-PAYMENT
    STAGING_TENANT_ID=<synthetic-tenant-uuid>
    STAGING_LOCATION_ID=<synthetic-kitchen-uuid>
    STAGING_INGREDIENT_ID=<synthetic-ingredient-uuid>
    STAGING_PURCHASER_JWT=<test-finance-purchaser-token>
    STAGING_APPROVER_JWT=<different-test-finance-approver-token>
    STAGING_RECEIVER_JWT=<test-inventory-receiver-token>

Run: npm run verify:invoices:staging. This has NOT been executed here.

## Next backend milestones

Supplier invoice document storage with private signed access, accountant-reviewed VAT mapping, 3-way exception queue, supplier invoice due-date alerts, restricted payables approval/exports, full stock-to-COGS snapshots, credit application reconciliation and independently confirmed bank/Adyen settlements. None should be represented as live until their own data sources, roles and controls have passed real staging tests.
