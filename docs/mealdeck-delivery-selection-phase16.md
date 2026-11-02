# Phase 16 — Delivery quote selection

Adds a pure lowest-eligible-cost selector for trusted server-side quotes from own fleet, Uber Direct, Deliveroo Express, Just Eat Go and Stuart.

A quote must be serviceable, non-expired, in the order's currency, have valid nonnegative integer-pence pricing and meet the configured delivery-time threshold. Lowest price wins; ties prefer a shorter ETA and deterministic provider priority.

## Integration gates
- Use only trusted, enabled provider integrations for the location and postcode; never fabricate availability or prices.
- Include real capability, kitchen-ready time, maximum delivery radius, driver eligibility/insurance, customer promise, taxes and surcharges in server-side quotes before comparison.
- Reserve/requote on the server before charging or confirming delivery. Handle price changes, provider failures, retries, cancellation, own-driver routing and courier tracking.
- Book a courier only after the order has fulfilled the required payment policy and kitchen preparation timing, with idempotent provider requests.
- Expose a single branded MealDeck tracking experience and preserve courier/customer data privacy.
- Test live-provider contracts in staging before activating. This PR does not book couriers or connect to provider APIs.

Run: `bun test tests/mealdeck-delivery-selection.test.ts`.
