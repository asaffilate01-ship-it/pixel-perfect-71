# MealDeck group ordering — controlled activation and verification

## Current boundaries

Group ordering has a full room UI, server handlers and privately scoped database functions. **Code and successful CI do not prove production room admission**. The public `GET /api/group-orders` response is authoritative for advertised new-room availability, but even a green GET is not a successful payment/kitchen acceptance test.

The existing system supports an organiser plus up to nine invitees, 180-second invitation joins, a server-owned 30-minute unpaid room deadline, named participant bags, separate payment or organiser-pays, and one master kitchen order only after full verified payment. Maintain these invariants.

## Read-only operations preflight

Use GitHub Actions → **MealDeck group-ordering live readiness (read only)** → **Run workflow**, or execute:

```bash
node scripts/mealdeck-group-readiness.mjs --live
```

The probe only performs a no-store HTTPS **GET** to `https://mealdeck.co.uk/api/group-orders`. It does not create rooms, submit names, activate membership, ask for secrets, accept payments, or touch a KDS queue. Only predefined codes and numeric HTTP status are printed; invitation tokens, actor cookies, personal details, raw response bodies and environment values are never logged.

Exit codes: **0** means the public server currently advertises new rooms and returns a secure actor cookie; **2** means paused, an unexpected API contract or a missing/insecure cookie; **1** means an unreachable/unverifiable endpoint. Treat a green report as admission evidence only.

## Production activation checks (owner/operator)

1. Confirm the live host uses the **independent MealDeck database**, never the Dishbee fallback. Check existing migrations, needed private tables/RPCs, private service-role boundaries, and the unattended unpaid-room cron job. Do not copy or reset live payment records.
2. Confirm the server's `MEALDECK_SHARED_PAYMENTS_ENABLED` flag is explicitly `true` and `MEALDECK_GROUP_LINK_SECRET` exists in the **server-side secret store**. Never put the key in source, browser-visible variables or CI output. The key must be 43–256 base64url characters, and rotation must account for existing room/invite access.
3. Confirm the live kitchen checkout gate, eligible guest/member payment state, correct Stripe account/mode and canonical checkout domain. Do not infer activation from frontend publication or a successful database migration.
4. Run the read-only probe. A paused result requires an owner-controlled configuration/checkout investigation. **Do not switch the flag on automatically** to make a test green.
5. With an authorised operator and controlled end-to-end test, verify a new room, a separate invitee device/session, cookie admission, three-minute joins, saving/ready choices, organiser final review, current menu pricing, member vs guest identity, Stripe test/live mode separation, payment retry and reconciliation, and one master order entering KDS **only after the full total is verified paid**. Preserve the production test/refund evidence without publishing user data.
6. Verify completed orders retain named bags, handover code and kitchen status. Verify expired unpaid rooms close without charging or releasing an order and that already-paid orders cannot be accidentally dropped.
7. Test Samsung/Android PWA, iOS and desktop for copy/share fallback, leave/rejoin behaviour, focus/keyboard reachability, mobile safe area, intermittent networks and service-worker refreshes.

## Non-negotiable safeguards

- Do not automate card charges, seed production orders or silently turn on paid group ordering during a code rollout.
- Room join IDs, invitation tokens, actor cookies, guest/member sessions and payment claims are separate authorities. No browser input can assert a paid state.
- Never bypass price/availability checks when doing one-tap additions; products with modifier group IDs, missing prices or price variants require the customiser and canonical validation.
- Draft choices are explicitly saved before marking a person ready; the public kitchen order is released only when payment collections are fully verified.
- Keep logs and analytics free of invitation fragments, contact details, payment tokens, car details and private menu drafts.

## What a successful release can honestly claim

The GitHub build/test/type-check proves code health. The read-only probe proves public group admission at one moment. Only a controlled real device/payment/KDS exercise proves **end-to-end group ordering**. These are different readiness milestones.
