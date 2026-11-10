# MealDeck Luton — cheapest eligible courier dispatch

## Customer-facing delivery rules remain unchanged

Orders continue through MealDeck checkout and Stripe's verified paid-order authority.
**Free delivery** applies only when the final payable basket after discounts is
**at least £15**, to a supported address within **4 km of LU4 8NU**.
A provider's merchant-side fee is **not** automatically passed to the customer.
Never confirm an unpaid delivery or advertise an unavailable courier.

## Delivery sequence

1. Customer chooses delivery; existing postcode, address and order-minimum
   checks apply. Checkout creates one canonical paid MealDeck order.
2. Kitchen accepts and prepares every constituent brand. KDS must show all
   purchased extras, flavours and packing instructions. No courier may
   collect until the order is fully prepared and bags are sealed.
3. Immediately before courier dispatch, recheck the order's canonical paid,
   ready and private address state under a server-side order lock. Request
   *real* cost and ETA quotes in parallel from switched-on, connected providers:
   MealDeck approved own driver, Uber Direct, Deliveroo Express, Just Eat Go,
   and Stuart. An external API must use production-authorised credentials,
   and the own-driver calculation must use a manager-approved real operating
   cost, available driver and distance estimate.
4. Reject switched-off, disconnected, serviceability-failed, expired, wrong
   currency, past-deadline or malformed quotes. Sort by merchant cost in
   pence, then ETA, then stable provider order. No synthetic fares, fake
   availability or implicit £0 own-driver cost.
5. Reserve one unique booking key for the paid order in a durable private
   database transaction **before** calling the winning provider. If a
   booking response is uncertain, HOLD for status lookup/manual review.
   Never automatically book the second-cheapest provider while the first
   booking is unresolved. Price/availability may change: re-quote and
   reauthorise before any *new* attempt with a separate recovery protocol.
6. Booking own fleet produces one authenticated assignment offer to an
   approved on-shift driver. Driver accepts, kitchen authorises sealed
   bag handoff, and completion remains staff-controlled. Third-party
   providers must return a booking ID, tracking reference and verified
   status updates before a real customer promise can be made.
7. Record costs, booking state, courier name/status where supplied, and
   exceptions in operations without leaking the customer's address, phone,
   tokens or provider credentials to non-authorised staff.

## Switchboard and release status

The migration `20261109235500_mealdeck_courier_switchboard.sql` creates five
independent per-kitchen switches. The **own-fleet switch defaults on** so
existing manual operations are preserved. All third-party switches default
off. A switch is NOT an API connection. The UI reports third-party
`connected=false` until approved live integrations are installed and
commissioned. No automatic external booking is enabled merely by turning
a switch on. Server-side insert guard prevents *new* own-driver assignments
when the own-fleet switch is off. Existing accepted assignments remain
manageable.

The `chooseCheapestCourier` function is a **trusted server-side planner**;
`dispatchSelectedCourier` is a one-booking protocol requiring a durable
reservation callback. These helpers do not, by themselves, obtain real
quotes or call vendor delivery-booking endpoints. Provider adapters and
transactional booking state must be connected and tested before enabling
automatic dispatch. Pending required integrations:

| Provider | Required upstream integration |
| --- | --- |
| Uber Direct | Approved Uber Direct merchant account, OAuth credentials, delivery quote, Create Delivery and status webhooks |
| Deliveroo Express | Approved Express API credentials, serviceability, create/update/accept quote, schedule delivery, callbacks |
| Just Eat Go | Approved JET Go delivery-as-a-service integration and live quote/order status API |
| Stuart | Approved Stuart OAuth credentials, pricing/job creation, state callbacks |
| MealDeck own fleet | Approved and available driver, true operating-cost model, trusted distance and the existing staff-scoped assignment/hand-off workflow |

**Current release gate:** Do not automatically dispatch until merchant
API credentials exist, a live provider-specific quote is verified,
driver acceptance/booking callbacks are tested, and single-booking
idempotency and failure recovery are demonstrated. Provider toggles alone
cannot constitute delivery readiness. Live delivery is not automatically
switched on by this migration.

## Official provider documentation

- Uber Direct API: https://developer.uber.com/docs/deliveries/get-started
- Deliveroo Express: https://api-docs.deliveroo.com/docs/overview
- Just Eat / JET Go: https://developers.just-eat.com/docs/jetgo-a-overview
- Stuart API: https://api-docs.stuart.com/

## Push notification approval

First-time browsers may stall on native permission, worker activation, push
subscription or server save. The new customer flow shows each phase, bounds
waiting, fails with a retry message, and calls the existing authenticated
`mealdeck_customer_save_push` RPC. A browser's *Allow* permission alone
does not count as connected: the server must confirm that exact endpoint
belongs to the signed-in member. iOS users must use an installed Home Screen
web app for Web Push. Push subscription, consent and promotional campaign
sending remain separate.
