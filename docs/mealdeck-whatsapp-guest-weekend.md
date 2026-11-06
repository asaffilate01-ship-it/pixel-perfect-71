# Opening-weekend quick checkout

Owner decision, 6 November 2026: customers enter their name and WhatsApp number only. No MealDeck email registration, email verification or password is needed for a guest order. This applies to the ordinary basket, the group organiser and individual group payers. Kerbside still requires car make, colour and exactly the last four registration characters. Both kerbside forms and the paid kerbside receipt show “Please park near our location, somewhere safe and legal, and keep your phone nearby.”

The guest session stores a genuinely absent email as SQL NULL. Historical email-bearing guest sessions and receipts remain valid. No fake email address, Auth user, verified-phone claim, marketing consent, membership or loyalty points is created. Entering a WhatsApp number is an order contact detail, not proof of phone ownership or activation of automated WhatsApp messaging.

## Monday boundary

New email membership registration is deferred from 6 November 00:00 until **Monday 9 November 2026, 00:00 Europe/London**. Customer UI and registration actions use server time, and the database independently rejects a new member profile during this interval. Existing members retain sign-in, profile access and idempotent registration recovery. Staff, printer and administrator authentication/password/MFA rules are unchanged. The client refreshes the entry policy at the boundary and on return to the page. Registration resuming does not reopen a paused kitchen, configure Resend or change opening hours.

Guest ordering still uses the existing server-authoritative launch hours, location, kitchen state, catalogue and payment-readiness checks. It cannot override the pre-opening test-account restriction. The existing 30% discount remains automatic and unchanged. Payment must still be independently verified before KDS release. Stripe-hosted payment collection is separate: omitting MealDeck's email field does not promise that Stripe will never request an email or billing details for the selected payment method.

## Privacy and deployment

Guest receipts remain protected by the existing high-entropy Secure/HttpOnly host cookie and scoped server RPCs. A matching name or phone number grants no access to another order. Existing email contacts are retained; no old account or order is rewritten. Contact details remain outside PWA caches. The old group-room footer about replies has been removed as requested.

Apply the complete reviewed SQL atomically to the independent MealDeck database before publishing the application. The release workflow creates the post-install migration filename using the official Supabase CLI; its contents must match `deploy/mealdeck/whatsapp-guest.sql`. It makes the guest email column nullable and updates only guest-session validation and customer-registration policy. Existing opening, payment, KDS, printer and staff routines are unchanged.

Run `bun test tests/mealdeck-whatsapp-guest.test.ts`, the existing guest/checkout/group suites and `node tests/postgres/whatsapp-guest-behavior.mjs --native` against a new disposable local PostgreSQL database. Never run the destructive fixture harness against hosted production. The new SQL checks cover null email, replay, contact validation, permissions, exact discount, kerbside details, private receipt access, Monday boundaries and existing membership recovery.

A source merge, migration or successful simulated checkout is not a live Stripe payment, real inbox/WhatsApp delivery or a physical printer test. Record live acceptance separately.
