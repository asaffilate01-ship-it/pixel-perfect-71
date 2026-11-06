# MealDeck staff connection activation — 6 November 2026

## Scope

The dedicated production database already contains the Luton business, kitchen,
79 approved menu records and station routes, and the requested staff assignments.
This release connects the application's strict MealDeck configuration to the
public connection that the owning Lovable project already provides. It preserves
the owner's newer password-management work and does not create another backend.

## Connection contract

`withMealDeckCloudConnection` accepts Lovable's complete build-time public pair
only for the approved `srsxybepwujuawyutnbs` project and its exact HTTPS origin.
The existing parser still rejects private keys, incomplete explicit settings,
legacy conflicts and mismatched project URLs. Explicit environments take
precedence; a staging database never inherits production kitchen identifiers.

The reviewed production tenant and Luton identifiers are supplied only when the
selected backend is this installation and there is no conflicting explicit scope.
No payment credential, API secret, email-confirmation flag, role or payment
approval is supplied. Customer, staff, printer and HTTP server entrypoints use
one adapter. The public bootstrap returns only its existing public descriptor,
with `Cache-Control: no-store, private`; it never returns the environment map.

## Staff entry points

- `/kds`: the kitchen account, or an authorised owner/admin, sees the shared Luton
  board. Each full order retains all brands, choices, extras and named packing.
- `/printer`: its independent printer session sees only permitted receipt jobs.
  A connection failure now offers reconnect without submitting a password. Old
  initialisation responses cannot replace a newer connection attempt, and failed
  sign-in attempts clear the password field.
- `/ops`: the menu account opens its permitted menu tools; an owner has the full
  operations workspace. SQL permissions, not the email address or navigation,
  determine which operations are allowed.

Account records and assigned roles are not successful sign-in evidence. The owner
must finish passwords and email verification through the existing Auth service.
This release does not bypass verification, manufacture sessions, or reset passwords.

## Kitchen and printing boundaries

The kitchen requires independently verified payment evidence. Staff acceptance
creates the first receipt job; all items must be checked before packing. A return
from checkout or a client-side success flag is not payment proof.

The existing receipt bridge supports its documented paired local TLS/TCP setup.
Physical automatic printing still requires the actual printer host, supported
ESC/POS model/cutter profile, local certificate trust, pairing and a paper test.
Browser printing remains an explicit fallback, not silent hardware acceptance.
Interrupted or uncertain sends are held for inspection rather than retried.

## Verification

Run the new connection tests with the existing runtime/cache tests, the complete
website suite, TypeScript, lint and the production build. The existing disposable
PostgreSQL kitchen/printer suite checks paid-only acceptance, one receipt per
accepted order, isolation, revoked access, per-item readiness, paper inspection,
explicit reprints and refund holds. The bridge suite uses a fake TCP printer.
These tests do not charge cards, send email, confirm real account emails, or
produce a physical receipt.

Resend, browser push, signed phone payment releases and end-to-end live payment
acceptance remain separate activation tasks. Public ordering stays subject to all
existing schedule, menu, kitchen and payment-readiness checks.
