# MealDeck Own-Driver App — Onyn-informed implementation plan

**Status:** Contract and unit tests only. Not a deployed driver app. Delivery checkout/KDS remain authoritative; this phase does not turn on delivery or publish GPS.

## Source review

- `asaffilate01-ship-it/onyn`: driver active-delivery workflow, location broadcast, dispatch driver, handoff.
- `asaffilate01-ship-it/onynapp-pakistan`: rider portal and operations.
- Open-source reference patterns: Fleetbase Navigator, OwnFleet and VROOM. Review licences before copying any source; prefer independently implemented interfaces.
- MealDeck authority: `docs/MEALDECK_LUTON_OWN_DRIVER_LAUNCH.md`, existing own-driver quote/order tables, KDS and receipt lifecycle.

## Proposed product

1. **Driver PWA first**, installable at a protected `/driver` entry point, then Capacitor for Android if background GPS and reliable notifications warrant it. Use MealDeck's visual identity, not Onyn branding. Accessible large targets and offline/error states.
2. **Dedicated owner-controlled driver records** with invitation-only signup, authenticated shift start/stop, vehicle and phone verification. Do not reuse Onyn session cookies, customer credentials or database roles.
3. **Server-authoritative dispatch:** one paid order, one active assignment with versioned atomic compare-and-swap and durable idempotency keys. KDS must finish and seal every bag before driver's verified pickup. Staff can explicitly reassign after a failed/declined job.
4. **Mobile stages:** offered → assigned → at kitchen → collected → at customer → delivered; record issues separately and ensure statuses only move after verified backend commits. Display customer address only to assigned on-shift driver.
5. **Handoffs:** pickup code/QR and delivery PIN or private photo proof with signed upload and retention controls. Never store proof photos in public buckets or request unnecessary ID photos.
6. **Location:** opt-in GPS while on shift and actively assigned; accuracy/freshness gate, server-side range checks, expiry and delete after retention policy. No GPS tracking for off-shift staff. Customer tracking should be a separate scoped signed token and only added after privacy review.
7. **Notifications:** event-driven job offer with retry and polling fallback. Never reveal address or customer contact in push payloads. Provide tap-to-navigate and customer contact relay.
8. **Later:** batching/routing with OSRM + VROOM only when multi-stop volume justifies it; earnings, incident reports and driver audit console.

## Integration gates before activation

- Confirm which existing staff auth identity and Supabase backend owns driver permissions.
- Add private driver/assignment tables with deny-by-default RLS and tenant/location checks; server RPCs for offer, accept, decline, reassignment and handoffs.
- Keep order totals, discounts, payment status and customer checkout entirely outside driver's write permissions.
- Build tests for concurrent accepts, duplicate events, wrong tenant, stale assignment, unavailable driver, lost mobile connection, cancellation/refund, failed proof, and double handover.
- Commission on real Android/iOS phones, verify printer v0.2.3 and end-to-end Luton delivery before enabling a production driver workflow.

`src/lib/mealdeck-driver-app-contract.ts` is a **pure client/server-shared validation aid**, never a substitute for backend checks.
