# MealDeck Operations Backend — Phase 7

**GitHub source only, 2 November 2026.** No database migration, role bootstrap, live login or payment activation has been performed. Customer ordering remains COMING_SOON=true. No Lovable used.

## Architecture and deployment

MealDeck uses the existing Dishbee Supabase project as its canonical store of tenants, locations, brands, menu items, paid orders, KDS and financial allocations. This phase does not create a second order ledger. Two separate, staged migrations must be deployed only to an approved existing Dishbee project, in order:

1. supabase/migrations/20261102191000_mealdeck_ops_core.sql — role-based staff access, owner-controlled assignment, tenant/menu RPCs and actor-stamped audit trail
2. supabase/migrations/20261102191500_mealdeck_ops_recipe_finance.sql — ingredients, recipe versions, stock, supplier cost history, append-only expenses, authoritative order history and finance/analytics RPCs

Do not run these SQL scripts against an empty/new MealDeck project: their required canonical Dishbee tables do not exist there. No applied migration should be amended. Local Supabase CLI and real Postgres replay have not been available to this build; verify with an approved staging environment and up-to-date Supabase CLI before release.

## Secure staff logins and permissions

The internal website route is /ops, with Supabase Auth email/password or existing-account email sign-in links. Automatic signup is disabled for the email-link flow. Login by itself grants **zero** menu, recipe, financial, staff or order access.

Staff accounts must be provisioned by an authorised operator in the approved Supabase Auth project. Staff access is then granted to that user's verified UUID and a specific canonical tenant ID. There is no signup trigger, unauthorised bootstrap, client-supplied role claim or use of user_metadata in authorisation. No passwords are managed in MealDeck source.

Role defaults:

| Role | Access |
| --- | --- |
| Owner | Full authorised tenant operations, finance, recipes and staff assignments |
| Admin | Full administration; owner role/privilege changes require an owner |
| Operations | Orders, kitchen workflow permission, recipes read, stock and analytics |
| Kitchen | Menu, orders, recipes and inventory read; not supplier costs or financials |
| Menu | Product management, recipes, ingredient definition and inventory read |
| Finance | Cost quotes, operating expenses, finance and analytics |
| Analyst | Aggregate order analytics and menu read only |
| Viewer | Menu read only |

Global tenant access or one kitchen only can be assigned. Per-person grant/deny permission arrays supplement role defaults; denials override global access at a restricted location. Staff cannot edit their own assignment. The public RPCs and protected PostgreSQL tables enforce permissions server-side using signed Supabase auth.uid(), not browser UI state.

**Initial owner bootstrap** is a separate, authorised DBA-only staging operation after verifying the real tenant and Auth user. For example:

    insert into public.mealdeck_ops_staff_access(
      tenant_id,user_id,location_id,role,enabled
    ) values (
      '<approved-tenant-uuid>'::uuid,
      '<verified-existing-auth-user-uuid>'::uuid,
      null,
      'owner',true
    )
    on conflict(tenant_id,user_id,scope_key) do nothing;

This is a placeholder example, not an executed action. Never copy real credentials/identifiers to GitHub issues or ChatGPT. Owner bootstrap and individual Auth provisioning need audit and sign-off.

### Browser configuration

Set only the approved public/publishable Supabase client key; **never** use a service_role, private API secret or Adyen credential in VITE_ variables:

    VITE_MEALDECK_OPS_SUPABASE_URL=
    VITE_MEALDECK_OPS_SUPABASE_ANON_KEY=

The staff portal fails closed if these are unset.

## Operational dashboards delivered in source

**Menus:** browse canonical Dishbee brands/categories, see MealDeck location visibility/price, create a master menu item (INACTIVE draft), edit global name/description/price, toggle visibility for one location only. Activating a draft requires an existing KDS station route; real allergen/modifier/availability review remains mandatory.

**Order history:** canonical Dishbee order source, status, fulfilment, created/paid timestamps, totals and item counts; detail drilldown displays real items, modifiers and kitchen notes only to authorised operations staff. No new order, refund or payment mutation.

**Recipes:** ingredient quantities in grams/ml/each, preparation method, yield, waste percentage and recipe version snapshots. Changes are tenant-global and require appropriate permission.

**Ingredients/stock:** canonical ingredient master, reorder thresholds and append-only signed stock movements with type and note. Actual purchase invoice approval, automatic production deductions, lot/FIFO/expiry tracking and supplier receipts are future work.

**Supplier costs:** location-specific net supplier pack prices with effective dates, pack size to base-unit conversion, estimated recipe cost and estimated food-cost percentage. Missing cost data is NOT treated as zero. Changing a supplier quote does not reprice old paid orders.

**Financials:** recorded paid Dishbee gross, pending orders, settled Hive refund allocations and append-only manual expenses. The report expressly marks VAT, actual COGS and bank/merchant settlement as NOT verified. It is not an audited P&L or VAT return.

**Analytics:** paid-order gross by date, source/channel and brand with a single master order and no per-brand duplication of the delivery fee. Aggregation is based on Dishbee paid_at, and must still be reconciled to provider/bank statements.

**Staff:** list authorised tenant staff (including their email only for privileged managers), assign kitchen or global roles, enable/disable access and configure individual extra grants and denials. No automatic invitation mail is represented as sent.

The staff console has a standalone premium workspace and a link from the public footer. Public customer checkout remains gated.

## Required staging verification

1. Replay the exact Dishbee dependency chain and the two source migrations on a disposable/approved staging project; validate SQL syntax, function signatures, schema ledger and Supabase security advisors.
2. Test anon, unauthorised authenticated, viewer, kitchen, menu, finance, admin, owner and a foreign-tenant account. Verify kitchen users cannot see costs/finance/staff data; a local role cannot edit global master prices.
3. Test per-location denial overriding a global grant and that a staff member cannot escalate their own access, change owners or create a new Auth user without authorisation.
4. Test menu draft remains inactive until canonical KDS routing, visibility/channel rules and human allergen verification are complete.
5. Test recipe version snapshots, valid unit changes, pack-cost conversion, missing supplier quotes, waste and yield calculations, and no retroactive price/order mutation.
6. Test append-only stock and expenses, category validity, source-date ranges, no over-counting delivery fees, paid_at cohort vs refunds and PII isolation.
7. Test signed-in staff browser flows, approved OTP email redirects, role revocation, cross-kitchen navigation, mobile responsiveness and keyboard accessibility.
8. Run Bun unit/source-contract tests, TypeScript, lint and production build on one exact commit. GitHub check failures before runner allocation do not count as test results.
9. Confirm no service-role key in the built browser bundle, configure no client-side financial secrets and verify offboarding.
10. Obtain a written operations/security/accountant sign-off and tested rollback before any production migration.

## Next backend phases

Supplier onboarding and purchase orders; real invoice and VAT handling; warehouse/stock lot traceability; menu and recipe publish approvals; packaging and labour costs; per-brand franchise royalty, tech/marketing fees and Adyen for Platforms settlements; KDS and delivery reconciliation; staff shifts/attendance; restricted payroll; accountancy exports; operational alerts and cost/stock anomaly detection. All require actual integrations and approvals, not fabricated historical numbers.
