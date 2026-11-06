# Included-drink stock and special requests

Owner decisions and reviewed release artifacts: **6 November 2026**. Both guarded extensions were installed and the compatible PR108 application was verified live at 19:54 UK. Actual hashes, deployment and public-stock checks are recorded in `mealdeck-cloud-deployment-status.md`.

## Included drinks use the actual stock item

The reported Rubicon Mango order selected an included meal drink after both standalone Rubicon products had been marked unavailable. The included adult/kids modifier options still had independent active flags. The temporary containment disabled those two options, without changing the paid order.

The durable extension freezes **28 reviewed bindings**: seven can/water choices across adult and kids' groups for Tavo and Skorch. Each option maps to the exact same-brand standalone stock SKU using source IDs. There is no runtime product-name matching, cross-brand stock guessing or price change.

`mealdeck_private.included_drink_stock_available(tenant, location, option)` checks that the target SKU is unique and belongs to the expected brand/category in the same tenant, is active, is visible on the exact kitchen's MealDeck channel, and has an active kitchen route. An unavailable target makes the included choice unavailable. The modifier's own active flag still applies, so manually disabling an add-on also keeps it unavailable.

The safe no-argument public catalogue overlays that result on its existing reviewed option availability. The canonical `price_checkout_lines` wrapper invokes the unchanged original pricer and then validates and locks the linked stock/routing rows. Both a fresh quote and first preparation from a stale quote reject a now-unavailable drink. Current public availability and canonical checkout must both retain this helper; do not restore an option-only availability path.

Prepared payment attempts keep their existing immutable purchased lines, total, provider binding and recovery. A later stock change does not abandon a payment already in progress or block verified payment reconciliation. Paid orders, KDS work and previously frozen receipt data are not edited. Staff must handle any already-purchased unavailable item operationally; this migration does not silently substitute a drink.

## Special requests are part of the reviewed quote

An optional `notes` field accepts up to **1,000 Unicode code points** of plain text. Normalisation converts CRLF/CR to LF and trims surrounding whitespace. Newlines and tabs are allowed; other control characters, Unicode format characters and malformed surrogate text are rejected. Text is escaped when displayed and does not change prices, selected extras, stock, packing or payment authority.

Nonblank notes become part of the server's selection hash. The service-only member/guest quote wrappers call the existing guarded quote RPCs, insert the validated text into private append-only `checkout_quote_notes` in the same transaction, and echo it for customer review. The application refuses to proceed if the saved echo differs. Blank/omitted notes keep the old RPC and request-hash behaviour.

The common materialisation function copies the note once from that immutable quote record into a new order. Existing payment preparations resume without rewriting it. Authorised customer receipts and KDS show the saved note; a newly accepted receipt snapshots it as `orderNotes`. Shared-payment notes are visible to the organiser, while participant projections retain their limited scope. No notes read/write grants are added to anonymous or ordinary customer roles.

The quote, materialisation, payment, KDS, numbering and receipt lifecycle stays authoritative. Unpaid and partially funded orders remain outside kitchen work. A note is a request to the kitchen and does not promise an allergen accommodation or substitute for a paid menu choice.

## Installation order

Apply each complete reviewed artifact atomically to the **independent MealDeck database**, in this order:

1. `20261106184640_mealdeck_paid_order_numbers.sql` — permanent paid-order numbers and compatible authorised projections.
2. `20261106190457_mealdeck_included_drink_stock.sql` — source bindings, private stock checks, canonical pricing/public catalogue wrappers and schema-cache reload.
3. `20261106191342_mealdeck_order_notes.sql` — immutable quote notes, service-only note-aware quote entries and additive order/receipt projections.

All three files are under `deploy/mealdeck/post-install-migrations`. Use their matching builders (`paid-order-numbers.mjs`, `included-drink-stock.mjs`, `order-notes.mjs`) to load the exact artifact. A managed builder is only for a runner that owns one atomic transaction and one complete migration. Preserve the independent-profile, owner, prerequisite and reviewed-function-body guards; a mismatch requires investigation, not guard removal.

The notes migration explicitly permits two reviewed definitions of the unchanged actor quote creator: the source definition and the captured live variant that retains the previously approved private-test opening discount. The exact diff changes only that offer condition. Neither variant is replaced by this release; fixture coverage checks that both install paths preserve the function body and the applicable discount amounts.

Publish the compatible application after the required database functions are installed and checked. Running staff clients should refresh to receive the updated contracts. The stock extension does not need a client-supplied stock flag or separate runtime feature switch.

### Temporary Rubicon containment

The existing containment operation is `deploy/mealdeck/operations/20261106_rubicon_mango_unavailable.sql`. Keep the two included modifier options disabled until the stock extension is installed and verified. Only the separately reviewed `deploy/mealdeck/operations/20261106_rubicon_mango_use_linked_stock.sql` operation may restore their original active state. It confirms the exact independent scope, unchanged option identities/prices, expected inactive flags and latest containment audit identities, installed stock function definitions and both standalone Rubicon products still out of stock; it audits the change.

Restoring those flags does **not** mean Rubicon is back in stock. The linked stock helper must continue to return false, and the public included choices must remain unavailable. Thereafter the same-brand standalone **Back in stock** action can restore the linked included choices naturally, provided their own option flags and every other eligibility check permit it. Do not leave a permanent hidden containment flag that defeats normal restocking, and do not reactivate unrelated choices.

## Read-only deployment verification

Run these only through an authorised read-only administrative connection to the correct MealDeck database. They inspect definitions/state and create no quotes, orders, payments or print jobs.

### Function shape and privileges

```sql
select n.nspname, p.proname, p.pronargs, p.prosecdef, p.proconfig,
       md5(p.prosrc) as body_hash,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'mealdeck_private')
  and p.proname in (
    'mealdeck_public_menu', 'included_drink_stock_bindings',
    'included_drink_stock_available', 'price_checkout_lines',
    'price_checkout_lines_before_included_stock', 'public_menu_before_included_stock',
    'normalise_checkout_notes', 'freeze_new_checkout_notes',
    'mealdeck_create_checkout_quote_with_notes',
    'mealdeck_create_guest_checkout_quote_with_notes'
  )
order by n.nspname, p.proname;
```

Compare hashes with the frozen merged artifacts. The no-argument public menu keeps anonymous/authenticated execute only. Both note-aware quote entries have service-role execute only. Private helpers/aliases have no execute grant for any of those API roles. All functions retain an empty search path; the note normaliser is deliberately an invoker helper, while exposed entries and canonical wrappers use their reviewed definer authority.

### Linked Rubicon state and public projection

```sql
with scope as (
  select i.business_id as tenant_id, l.id as location_id
  from mealdeck_private.installation i
  join public.tenant_locations l on l.tenant_id = i.business_id
  where i.singleton and i.profile = 'mealdeck-independent-v1'
    and l.slug = 'shared-kitchen' and l.active
)
select b.source_option_id, b.target_sku, o.active as option_active,
       mealdeck_private.included_drink_stock_available(
         s.tenant_id, s.location_id, b.option_id
       ) as linked_stock_available
from scope s
cross join lateral mealdeck_private.included_drink_stock_bindings(s.tenant_id) b
join public.modifier_options o on o.tenant_id = s.tenant_id and o.id = b.option_id
where b.source_option_id in (
  'skorch-burgers-included-meal-drink-rubicon-mango',
  'skorch-burgers-kids-included-drink-rubicon-mango'
);

with snapshot as (select public.mealdeck_public_menu() as value)
select item->>'sku' as sku, choice.key as source_option_id,
       choice.value->'available' as available
from snapshot,
     jsonb_array_elements(value->'items') item,
     lateral jsonb_each(item->'options') choice
where choice.key in (
  'skorch-burgers-included-meal-drink-rubicon-mango',
  'skorch-burgers-kids-included-drink-rubicon-mango'
)
order by sku, source_option_id;
```

While the standalone product remains hidden, linked stock and all offered Rubicon choices must be false both before and after the guarded restoration. This query deliberately returns stable source identities and booleans, not private customer information.

### Existing authorised order after a real customer submits notes

Bind `$1` to that authorised order UUID using the read-only query client's parameter mechanism. This checks equality without returning the customer's note text:

```sql
select o.id as order_id, o.payment_status,
       o.notes is not null as notes_present,
       char_length(o.notes) as notes_length,
       n.notes is not distinct from o.notes as frozen_quote_matches_order,
       (select count(*) from public.kds_tickets k where k.order_id = o.id) as kds_tickets,
       (select count(*) from mealdeck_private.receipt_jobs j where j.order_id = o.id) as receipt_jobs,
       (select bool_and(j.receipt->>'orderNotes' is not distinct from o.notes)
        from mealdeck_private.receipt_jobs j where j.order_id = o.id) as receipt_notes_match
from public.orders o
left join mealdeck_private.stripe_orders s on s.order_id = o.id
left join mealdeck_private.payment_orders p on p.order_id = o.id
left join mealdeck_private.checkout_quote_notes n
  on n.quote_id = coalesce(s.quote_id, p.quote_id)
where o.id = $1::uuid and o.source = 'mealdeck';
```

Expect no KDS work before canonical paid release and no original receipt before staff acceptance. An absent receipt gives a null receipt comparison; that is not a print failure or proof of printing. Existing orders without requests remain valid with null notes.

## Verification evidence and limits

Local PGlite completed **6 stock behaviour groups**, including every one of the 28 bindings, fresh/stale quote denial, private ACLs, no stock/price writes and prepared-payment recovery/reconciliation. The notes suite completed **12 behaviour groups**, covering member/guest scope, control-character rules, immutable storage, unpaid invisibility, full shared funding, historical receipt preservation, stock integration, both reviewed quote-creator variants and rollback. Focused application/API tests also check normalisation, saved-note echo, hash compatibility and strict Terminal input compatibility. Native PostgreSQL CI runs the corresponding suites through the existing isolated harness; report its actual result separately.

These are software and local database checks. They do not confirm hosted installation, a new live payment, a customer's specific special request being fulfilled or physical printer output. The separate Senraise dependency is recorded in `mealdeck-senraise-printer-status.md`.
