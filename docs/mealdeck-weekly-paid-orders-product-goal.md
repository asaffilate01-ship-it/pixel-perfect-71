# MealDeck product goal — weekly orders paid

**Goal:** Diners in Luton and St Albans get the meals they're craving.

**North-star measure:** Orders paid for each week.

## Implementation
The private `/ops` Overview now shows eight Monday–Sunday reporting weeks (the current week is explicitly *week to date*), separate Luton and St Albans counts, a previous full-week comparison, and a combined count only when **both** location reports are available and authorised.

Each physical multi-brand basket counts as **one order**, no matter how many brands, kitchen stations, invitees or payment shares participated. Group-payment transactions and estimated basket prices are never counted as additional orders.

The app reuses the existing `mealdeck_ops_analytics` RPC guarded by `analytics.read` per Dishbee tenant and location. It uses paid_at-derived reporting days, not page visits, checkout attempts, order_created, card authorisations, KDS tickets or courier bookings.

The period is based on Dishbee reporting dates, with Monday–Sunday week boundaries. The current partial week must not be compared as though it were complete. Comparisons in the UI use the last **two completed weeks**, not the current partial week.

The helper validates daily row structure, exact requested period, duplicates, and the paid order total versus daily sum. Invalid or inaccessible reports display *unavailable* rather than fabricated zeroes. An unauthorised staff member does not gain data access simply by viewing the two-location goal; aggregate counts are shown only when authorised results for both locations are present.

## Safety and rollout
- No new public endpoint, service-role browser exposure, arbitrary tenant selection or order writes
- No marketing claims of real orders made from unconnected/sample data
- No checkout or launch status changed
- No payment settlement, refund-netting or fulfilled-order claims: paid_at is a **recorded paid-order signal**, not independently reconciled settlement
- Only authorised internal staff can access this dashboard
- Location labels must match the canonical Dishbee kitchen names; missing or ambiguous location mapping fails closed
- Production Supabase staging replay, Adyen captured-event integrity and KPI acceptance remain separate go-live requirements

Run `bun test tests/mealdeck-weekly-paid-goal.test.ts` and the repository verify workflow before merging.
