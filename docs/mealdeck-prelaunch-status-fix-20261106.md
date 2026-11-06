# Pre-opening tester availability — 6 November 2026

The owner requested ordering only for the authenticated `test@mealdeck.co.uk`
account before 15:00 Europe/London on 6 November, with public ordering beginning
at 15:00 subject to operational and payment readiness. The recorded test window
is 08:00 inclusive through 14:59:59, ending exclusively at 15:00.

## Root cause and source correction

The hosted database already has the private `launch_test_access` allowlist,
`begin_launch_test_context` mutation guards and the service-only
`mealdeck_checkout_status_for_customer(uuid,uuid,uuid)` RPC. The website only
read the anonymous public status and omitted the bearer from its capability
GETs. Consequently the correctly closed public schedule also blocked the tester.

Availability requests now carry the current customer bearer. The server checks
it with Auth before asking the service-only RPC for that returned user's status.
The browser cannot open checkout with a query email, supplied customer UUID,
local clock or a flag. Quote requests, group creation and group-payment checks
use the same identity-aware path. Guest mutations remain guest-only and cannot
borrow the member's identity. Responses remain private and non-cacheable.

The fallback is used only when the public channel is closed and the kitchen is
Online or Busy. Pause/Closed, missing extensions, absent server/provider secrets,
unsigned-off payment readiness and invalid provider configuration stay closed.
Existing payment reconciliation, receipt polling and order authority are unchanged.
No account was verified and no payment was taken by this source change.

The obsolete group-room footer about collecting replies is removed.

## Hosted settings receipt

At 10:39 UTC on 6 November the explicitly requested Luton setting was changed
from Closed/disabled to Online/enabled, retaining the configured 30-minute
collection estimate and fixed public opening schedule. The change was audited as
`checkout.prelaunch_activation` by the database operator, not an impersonated
staff identity. The anonymous database channel remained closed. The subsequent
10:41 UTC account-specific read returned `channelOpen:true` and
`guestCheckoutEligible:false` for the approved test account.

These are database checks, not a successful browser payment, webhook, KDS or
physical-printer acceptance. Production still needs the existing server payment
configuration and publication of this source. No readiness flag is set merely
to bypass a missing provider connection.

## Verification

`tests/mealdeck-prelaunch-status.test.ts` exercises the real HTTP handlers with
simulated Auth/database transport: test vs anonymous/other users, injected query
identifiers, invalid/unverified identities, boundary times, quote and group
capabilities, missing configuration, operator controls and private GET transport.
Run alongside the existing guest/group/payment suites; mock success is not live
provider evidence. The existing database test window and wrappers are prerequisites
on the dedicated MealDeck database; this source patch does not alter that schema.
