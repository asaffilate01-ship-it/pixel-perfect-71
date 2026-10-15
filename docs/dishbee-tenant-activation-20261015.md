# MealDeck → Dishbee launch boundary (15 October 2026)

MealDeck is **one Dishbee multi-brand tenant** with separate **Luton** and **St Albans** location UUIDs.
Cafe 1 St Albans and Cafe 1 Luton are **two additional, independent Dishbee tenants**.
The Café1 brand inside MealDeck St Albans is a location-specific MealDeck catalogue entry,
not a second Cafe 1 trading/data tenant.

## Runtime configuration

Configure these on the MealDeck **server**, using identifiers read from a verified Dishbee
staging/runtime deployment, not guessed values:

- `DISHBEE_SUPABASE_URL`, `DISHBEE_SUPABASE_ANON_KEY`
- `MEALDECK_TENANT_ID`: the **same** canonical MealDeck Dishbee tenant for both locations
- `MEALDECK_LUTON_LOCATION_ID`: MealDeck Luton only
- `MEALDECK_STALBANS_LOCATION_ID`: MealDeck St Albans only

The optional legacy `MEALDECK_LUTON_TENANT_ID` and
`MEALDECK_STALBANS_TENANT_ID` remain accepted for existing configurations **only if they
match each other and the canonical ID, when present**. Conflicts, missing required values
or equal kitchen UUIDs fail closed as an unconfigured live catalogue/checkout, never
as a fabricated single-tenant binding.

The frontend must not infer that the availability of menu sample data means that a
location is operational. St Albans MealDeck launch is delivery-only; the separate
Cafe 1 direct site retains its own fulfilment modes.

## Production blockers, not solved by this repository patch

1. Dishbee must run its actual staging migration/tenant-blueprint procedure, provision
   the draft MealDeck tenant and both locations, and record authoritative UUIDs.
2. The latest MealDeck `placeOrder` creates a `payment_pending` order but
   receives **no payment-session URL/client secret**. The UI shows an unpaid order
   code without a way to complete payment. Do **not** market this journey as a
   functioning live checkout or enable live customer trading until fixed.
3. Implement a server-created hosted or embedded payment session against the
   Dishbee order's **server-verified amount** using an approved MealDeck merchant
   configuration. Return only a safe checkout continuation to MealDeck. Verify
   webhook signature, amount/currency, tenant, location and order; guard retries,
   duplicates, declines, expiry, refunds and reconciliation. **Only server-confirmed
   paid orders may release the KDS**.
4. Test multi-brand order → payment → station KDS → central pass → handoff /
   eligible delivery; run cross-tenant negative access tests and rollback rehearsal.
5. Confirm deployed release SHA, hosted CI checks, location menus, service areas,
   hardware and provider approvals. Repo changes do not apply production migrations.

## Verification

- `bun test tests/mealdeck-runtime-config.test.ts`
- `bun run build && bunx tsc --noEmit`
- St Albans mobile: verify only the Delivery option is offered and server validation
  accepts it; direct Cafe 1 St Albans modes must remain unaffected.
- Luton mobile: verify delivery/pickup/kerbside are offered **only where Dishbee
  has enabled them**, and both kitchens resolve to distinct locations of the same
  MealDeck tenant.

Green local/CI tests still do **not** establish production tenant creation, merchant
authorisation or payment acceptance. If GitHub Actions ends with runner_id=0 and
zero executed steps, treat it as an infrastructure-execution failure, not a test pass.
