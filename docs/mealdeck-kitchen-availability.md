# Luton kitchen availability controls

The owner requested four easy admin choices on 5 November 2026. The controls appear first on **Overview** and are also available in **Finance** for the authorised owner/admin of the selected kitchen. Clicking a state saves it immediately; the selected style changes only after the server confirms the saved state. Failed requests retain the last saved state.

| State  | New orders                                                         | Pickup estimate and customer message                                                                    |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Online | Accepted when menu, payment, location and opening-hour checks pass | Uses the configured pickup estimate.                                                                    |
| Busy   | Accepted under the same checks                                     | Shows the actual configured estimate for new orders. Staff can increase it; no extra delay is invented. |
| Paused | Stopped until another state is selected                            | Shows a temporary pause. No automatic resume or countdown.                                              |
| Closed | Stopped until another state is selected                            | Shows that the kitchen is closed to new orders.                                                         |

All times remain subject to the confirmed 6–8 November launch windows. Selecting Online cannot open checkout before the confirmed opening time or bypass an unconfigured payment connection. After launch weekend, the existing manual service model remains: staff must select Closed outside service until regular opening hours are configured.

## Estimate and existing orders

Online and Busy require an explicit whole-number estimate from 5 to 180 minutes. The separate **Save estimate** action updates the estimate without changing the latest saved kitchen state. It cannot reopen a kitchen paused by another admin while this tab was open. Timing is approximate, starts from verified payment and never substitutes for the team's ready/handoff state.

Pause and Closed buttons submit a null estimate to preserve the current value. An unfinished or invalid estimate edit therefore cannot prevent stopping new orders. An explicitly submitted valid estimate can still be saved while paused or closed.

A changed pickup estimate expires unprepared quotes so the customer reviews the current promise. Already prepared provider sessions retain their original total and estimate. Pausing or closing leaves provider reconciliation, customer receipt access, kitchen work, acceptance receipts and physical print recovery running. It does not mark an order paid, cancel it or create a refund.

## Authority and API

`mealdeck_private.checkout_settings.availability_state` is restricted to `online`, `busy`, `paused` or `closed`. A database constraint keeps it consistent with `checkout_enabled`: only Online and Busy are enabled. Existing enabled settings migrate to Online; disabled settings migrate to Closed.

The authenticated RPC is:

```text
mealdeck_ops_update_checkout_availability(
  p_tenant, p_location, p_state, p_collection_estimate_minutes
)
```

The database independently checks verified active identity, owner/admin role, `finance.manage`, the selected tenant/kitchen and the independent MealDeck installation. Every successful change records the actual previous and next state in the scoped audit log. Browser flags grant no authority. Anonymous and service API roles cannot operate the admin switch.

The separate `mealdeck_ops_update_collection_estimate(p_tenant, p_location, p_collection_estimate_minutes)` RPC uses the same authority and kitchen lock, reads the latest saved state, and changes only the estimate. This prevents a stale estimate editor from undoing a newer Pause or Closed action.

`mealdeck_ops_checkout_settings` adds `availabilityState` to its existing response. The legacy boolean update RPC keeps its signature and maps true to Online and false to Closed. It retains fixed launch-date validation and the same authority checks.

Public checkout status adds `kitchen: { state, collectionEstimateMinutes } | null`. Both the server and browser require a valid accepting state before starting new checkout; missing or malformed state never enables ordering. Customer status polling rejects outdated responses. Receipt access remains independent of ordering availability.

## Installation and verification

Apply `20261105150406_mealdeck_kitchen_availability.sql` only after the independent foundation, customer, Stripe, kitchen/printer and guest extensions. Submit the complete unchanged standalone file as one request with its outer transaction. Historical migrations remain unchanged. The migration does not enable an ordering channel, create accounts, configure Stripe or start an order.

The focused PostgreSQL suite covers role and scope isolation, all four transitions, estimate validation and preservation, stale quote invalidation, unchanged prepared-payment reconciliation, receipts, fixed opening hours and compatibility with the legacy setter. Native PostgreSQL CI exercises concurrent connections. The actual hosted execution and verification receipt is recorded in `mealdeck-cloud-deployment-status.md`.
