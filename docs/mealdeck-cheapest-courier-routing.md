# MealDeck Luton — cheapest eligible courier dispatch

## Customer-facing pricing, November 2026 and December onwards

Orders continue through MealDeck checkout and Stripe's verified paid-order authority.
The coverage radius stays **4 km from LU4 8NU** unless the owner changes it.

| Period (Europe/London fulfilment date) | Minimum food spend AFTER discounts | Delivery fee |
| --- | --- | --- |
| Until 30 November 2026, inclusive | £15.00 | **Free to the customer**; MealDeck funds any courier cost |
| From 1 December 2026 | £10.00 | A separately itemised fee based on the **verified, current courier price**; an initially exact pass-through, not an invented flat fee |

The £10/£15 minimum applies to **food after discounts, excluding the delivery fee**.
A customer must see the delivery fee and final total BEFORE paying.
A live quote and courier availability must be confirmed for the same
collection/delivery details, currency, pickup window, merchant and address.
The charge is locked into the authorised payment/receipt. Once paid, changes
to the provider's actual cost are MealDeck's responsibility, NOT an
unannounced extra charge to the customer. For accurate comparisons the
fee adapters must normalise tax and service fees on an all-in basis.

**Go-live limitation:** Uber Direct, Deliveroo Express, Just Eat Go and Stuart
do not yet have approved production quote/booking adapters connected to this
project. No merchant fee can legitimately be inferred from generic website
prices. The December checkout currently fails closed rather than collecting
£0 delivery fees; the new database trigger
`20261109235501_mealdeck_december_delivery_paid_quote_gate.sql`
refuses new unquoted MealDeck Luton delivery materialisations from
1 December. This temporary gate must be replaced with an authorised
signed-quote-and-booking transaction before paid December delivery can open.
Do not disable it merely to expose a button. The November promotion continues
without a delivery charge or customer minimum change.

## Delivery sequence

1. Customer chooses delivery; existing postcode, address and order-minimum
   checks apply. Checkout creates one canonical paid MealDeck order.
2. Kitchen accepts and prepares every constituent brand. KDS must show all
   purchased extras, flavours and packing instructions. No courier may
   collect until the order is fully prepared and bags are sealed.
3. At checkout in December, obtain the **customer-facing** live delivery
   quote in time to show its fee before taking payment. After the kitchen
   prepares all brands and seals the bags, recheck the order's canonical paid,
   ready and private address state under a server-side order lock. Request
   *fresh real* cost and ETA quotes from switched-on, connected providers:
   MealDeck approved own driver, Uber Direct, Deliveroo Express, Just Eat Go,
   and Stuart. An external API must use production-authorised credentials,
   and the own-driver calculation must use a manager-approved real operating
   cost, available driver and distance estimate.
4. Reject switched-off, disconnected, serviceability-failed, expired, wrong
   currency, past-deadline or malformed quotes. Sort by merchant cost in
   pence, then ETA, then stable provider order. No synthetic fares, fake
   availability or implicit £0 own-driver cost.
5. Only book the cheapest eligible **ready-time** provider. If the
   latest price differs from the fee already collected, MealDeck absorbs
   that difference; NEVER amend an already captured customer payment.
   Reserve one unique booking key for the paid order in a durable private
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
