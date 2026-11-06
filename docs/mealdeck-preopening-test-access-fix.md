# Pre-opening account-aware checkout — 6 November 2026

The existing dedicated production database has the approved launch-test window,
identity allowlist, service-only status RPC and identity-bound quote/payment entry
checks. The website previously ignored that private status and used the public
opening-hours response for every customer, blocking the approved tester.

This repair sends the current customer bearer on availability requests to
`/api/checkout`, `/api/group-orders` and `/api/group-payments`. Before using the
private status RPC, the server verifies the token with the same MealDeck Auth
project. It passes only the returned user ID to the service-only
`mealdeck_checkout_status_for_customer` function. Browser email strings, URL
parameters, clocks, user metadata and room cookies cannot grant the exception.
The same check now applies when creating a quote or starting group payments.

The database owns the exact window: 08:00 inclusive to 15:00 exclusive on
6 November 2026, Europe/London, only for the configured verified test identity.
At 14:59:59 the test exception still applies; at 15:00 it ends and the previously
configured public opening schedule takes over. Public/guest status remains
closed before 15:00. No production clock, identity, password, payment, menu,
opening schedule, credential or kitchen-state record is changed by this patch.

Pause/Closed, channel availability, server credentials, Stripe configuration and
integration acceptance remain required. This patch does not manufacture sign-off
or mark any order paid. Receipt and webhook recovery paths are unchanged. Status
responses remain private/no-store and vary by Authorization and Cookie.

Existing databases without the private RPC fail closed for pre-opening members;
normal public-hours checkout remains compatible. On the confirmed MealDeck
project, read-only checks at 10:40–10:47 UTC confirmed the test account verified,
contact details present, test status open and public status closed. The helper
was checked as service-only; no browser-role execution was granted.

Automated HTTP tests simulate Auth and the scoped database response. Live
end-to-end Stripe/KDS/physical-printer acceptance is a separate check, not implied
by these tests. The paid preorder session, its original terms and provider
confirmation remain authoritative.
