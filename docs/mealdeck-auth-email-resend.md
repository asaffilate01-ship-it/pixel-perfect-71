# MealDeck authentication email with Resend

## Outcome and current activation boundary

The owner requested Resend delivery and the approved MealDeck logo for verification emails. This change prepares thirteen branded HTML/plain-text templates, a signed Resend Auth email hook, and a confirmation page that preserves the existing provider token and PKCE flow. It does not send an email, install an API key, change a hosted sender, verify an account or grant ownership.

**MealDeck currently uses its dedicated Lovable Cloud backend.** As checked on 5 November 2026, Lovable's public documentation describes its own managed Auth email delivery and a separate Resend connector for application emails. It does not document a self-service Cloud Auth custom-SMTP or Send Email Hook setting. Adding a Resend key to application secrets alone is not evidence that verification mail now uses Resend. The project's actual supported Auth configuration must be confirmed through the owning account or Lovable support. Do not migrate Auth identities or create a second backend to work around this distinction.

Prefer **Resend SMTP plus the provider's email templates** when the current Auth host exposes that supported configuration. It keeps the provider's complete delivery and recipient behavior. The signed HTTP hook is an alternative for the **same** MealDeck Auth project only when the host supports Supabase-compatible Send Email Hooks. Configure one delivery mechanism at a time: an enabled Send Email Hook replaces SMTP.

## Reviewable files

- `emails/auth/manifest.json`: subjects and HTML/text filenames for six authentication messages and seven optional security notifications.
- `emails/auth/*.html` and `*.txt`: generated templates ready for review and supported SMTP-template configuration.
- `public/email/mealdeck-logo.png`: unchanged copy of the approved `src/assets/mealdeck-logo.png` artwork.
- `src/lib/mealdeck-auth-email-templates.ts`: common wording and email-safe inline layout used by SMTP output and the hook.
- `src/lib/mealdeck-auth-email.server.ts`: disabled-by-default signed hook at `POST /api/auth/email`.
- `src/routes/auth.confirm.tsx`: explicit confirmation screen; no token consumption on page load.

Regenerate the local templates after editing the shared source:

```sh
bun scripts/build-auth-email-templates.ts
bun test tests/mealdeck-auth-email.test.ts
```

The generator only writes files. It has no provider call or send action. SMTP templates preserve `{{ .Token }}` and wrap `{{ .ConfirmationURL | urlquery }}` in the same confirmation interstitial. Keep these provider variables intact when installing templates. The provider's HTML-template field receives the HTML; the `.txt` files are reviewable equivalents and are used directly by the hook. Use a separate plain-text field only if the host supplies one.

## Preferred supported setup: Resend SMTP

In the owning **MealDeck** Auth project's supported SMTP configuration, use the sender address already verified in the owner's Resend account. No sender address or DNS verification is assumed by this source.

| Setting        | Value                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| Host           | `smtp.resend.com`                                                                       |
| Port           | `465` with implicit TLS, or the host's supported `587` STARTTLS option                  |
| Username       | `resend`                                                                                |
| Password       | The owner's Resend API key, entered only into the provider's secret field               |
| Sender name    | `MealDeck`                                                                              |
| Sender address | An owner-approved, Resend-verified mailbox on `mealdeck.co.uk` or its sending subdomain |

Install the six matching Auth templates and their subjects from the manifest. Optional security notifications also have templates, but this change does not turn those notifications on or off. Keep email confirmation, Secure Email Change, Auth rate limits and other account protections intact. Disable Resend click/open tracking for authentication mail so links remain intact and sensitive sign-in activity is not tracked unnecessarily.

| Provider template      | Source filename         |
| ---------------------- | ----------------------- |
| Confirm signup         | `signup.html`           |
| Magic link / email OTP | `magiclink.html`        |
| Reset password         | `recovery.html`         |
| Invite user            | `invite.html`           |
| Change email           | `email_change.html`     |
| Reauthentication       | `reauthentication.html` |

Use the existing production Site URL `https://mealdeck.co.uk` and the fixed redirect destinations below. Deploy `/auth/confirm` and the logo asset **before** switching templates. A source merge is not proof that the published host serves them.

If the managed Cloud interface does not offer supported SMTP, do not disable its current Auth email service. Obtain the provider-supported SMTP/hook connection first. The general Resend application connector does not by itself replace Auth-generated verification email.

## Supported alternative: signed Send Email Hook

The hook uses the pinned `standardwebhooks@1.1.1` verifier. It verifies the unchanged raw JSON body, event ID, versioned signature and five-minute timestamp tolerance before parsing recipients or contacting Resend. Only the current and explicitly configured previous signing secrets are accepted. Requests are bounded to 64 KiB. Browser bearer tokens grant no hook authority.

The hook reads these **server-only** settings:

| Setting                                                         | Purpose                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MEALDECK_AUTH_EMAIL_ENABLED=true`                              | Explicitly enables this route after supported host configuration is ready; absent/false disables sends    |
| `RESEND_API_KEY`                                                | Owner-supplied Resend sending key, restricted to the approved domain where possible                       |
| `MEALDECK_AUTH_EMAIL_FROM`                                      | Verified sender mailbox only, without a display name; the code supplies `MealDeck`                        |
| `MEALDECK_AUTH_EMAIL_HOOK_SECRET`                               | This project's generated Send Email Hook secret (`v1,whsec_…` or `whsec_…`)                               |
| `MEALDECK_AUTH_EMAIL_PREVIOUS_HOOK_SECRET`                      | Optional temporary previous secret during a controlled rotation                                           |
| `MEALDECK_SUPABASE_URL` and `MEALDECK_SUPABASE_PUBLISHABLE_KEY` | Existing paired dedicated MealDeck connection, reused to bind verification links to the correct Auth host |

Keep `MEALDECK_AUTH_EMAIL_ENABLED=false` until the host supports and is ready to bind the hook. Never put these private settings in `VITE_*`, `EXPO_PUBLIC_*`, the browser bootstrap, template files or source control. The hook needs no service-role key and makes no Auth admin or database write.

After the host confirms support, its authorised operator configures a **Send Email** HTTPS hook for `https://mealdeck.co.uk/api/auth/email`, generates the project's signing secret, installs the server settings securely, and enables the hook with the Email Provider still enabled. The HTTP route uses the webhook signature as its authentication; it does not accept a user JWT instead. Do not generate or resend a verification email as a configuration probe without the owner's explicit send instruction.

One Resend batch contains all recipients for an Auth event. A SHA-256-derived idempotency key binds the dedicated Auth origin and stable webhook ID, without exposing the email address or OTP in the key. A timeout retry uses the same key and exact message body. Resend retains idempotency keys for **24 hours**; this is provider-bounded deduplication, not an indefinite delivery ledger. A captured webhook cannot simply be replayed later because the signature timestamp expires. Provider failures, missing acknowledgements and incomplete batches return an error to Auth; none are reported as successful verification.

The provider request times out after four seconds to fit Auth's documented five-second HTTP hook budget. There is no automatic fallback provider or application retry with a new ID. A changed template during an in-flight retry can produce a provider idempotency conflict and should be resolved without resending a different body under a new ID.

## Confirmation links and existing sign-in behavior

Emails link to `/auth/confirm#confirmation_url=…`. The one-time provider URL is in the fragment, which is not sent in the HTTP GET. The page removes the fragment from the visible address/history entry and waits for the person's **Continue** button press. Ordinary URL previews and page loads do not exchange or verify a token. A scanner that actively simulates user interaction is outside that ordinary-preview protection.

On Continue, the page navigates only to the currently configured MealDeck Auth origin at `/auth/v1/verify`. The allowed provider query contains exactly `token`, `type` and `redirect_to`. Provider token hashes, including the `pkce_` prefix, are retained unchanged. The existing Auth service and browser PKCE exchange still perform verification and establish the session; this page has no signup, token-exchange, account-write or paid-order authority.

The production return allowlist is deliberately fixed:

- `/account`
- `/account?returnTo=%2Fcheckout`
- `/account?returnTo=%2Fcheckout%3Fgroup%3D1`
- `/account?returnTo=%2Fgroup-pay`
- `/account?returnTo=%2Fgroup-order`
- `/ops`, `/kds`, `/printer`

The root production Site URL maps to `/account` for native OTP defaults. Other origins, arbitrary queries, duplicate provider fields, credentials in URLs, fragments and admin/provider paths are rejected. The confirmation page is no-store, no-referrer, noindex, nofollow and noarchive, and belongs outside the public sitemap. The service worker does not cache this route or Auth/API traffic.

Group-room sign-in returns only to the fixed `/group-order` page; older shared-payment sessions retain the fixed `/group-pay` return. Room IDs and invitation capabilities are restored by the room flow, never appended to the Auth email return URL. Add the exact production URL `https://mealdeck.co.uk/account?returnTo=%2Fgroup-order` to the owning Auth host's supported redirect configuration; do not widen the application allowlist to arbitrary room queries or fragments. This follows the provider's guidance to use [exact production redirect paths](https://supabase.com/docs/guides/auth/redirect-urls). If a confirmation opens in a browser without the room context, reopen the original room link after sign-in.

Native staff email sign-in sends no custom-scheme redirect and verifies the code in the native app. Its Auth host must retain the production Site URL above; an empty hook redirect also defaults to `/account`.

The email also contains the one-time code. Customers and native staff can enter it on the original requesting browser/phone; this helps when an email opens in another app where the PKCE verifier is unavailable. Use the latest requested email and preserve the existing Auth expiry and resend behavior. The interstitial does not add password-recovery UI or change staff access, enrolment or permission rules.

## Email-change and notification details

Secure Email Change requires two correctly paired messages. Supabase's historical hook names are counterintuitive: send `token` with `token_hash_new` to the **current** address, and `token_new` with `token_hash` to the **new** address. When only the new-address pair exists, send one message to the new address. Incomplete dual pairs are rejected before any provider request.

The completed email-change security notice goes to the old address. Reauthentication is code-only. Other enabled security notices contain no OTP or private user metadata. The current upstream hook payload does not carry a separate former-identity recipient for every `identity_unlinked_notification`; the hook can only use the signed payload's current `user.email`, matching the documented upstream limitation. SMTP retains the provider's fuller recipient behavior and is therefore preferred when those flows are needed. Confirm the actual host's notification payload before activating the hook for such a deployment.

## Acceptance and current evidence

Local automated checks cover bad/missing signatures, old/future timestamps, secret rotation, unchanged raw-body verification, disabled and mixed-project configuration, unknown actions, recipient/token pairing, concurrent/replayed provider IDs, lost responses, strict redirects, PKCE/group preservation, plain-text output and escaping. Tests use synthetic data and a mocked Resend endpoint. They send no messages.

The 5 November release passed the production build, TypeScript and scoped lint checks; its email suite had 21 tests, with 33 across the focused customer-return/customer run. Those counts are historical. The room extension adds signed-delivery/interstitial coverage for `/group-order` and rejects room IDs, invitation data, fragments and extra return parameters. The earlier local Playwright browser binary download returned a truncated archive, so that release claimed no visual browser or inbox-rendering acceptance. Record current device/inbox evidence separately during hosted activation.

Before claiming hosted readiness, the authorised operator should verify the published confirmation page/logo, the actual sender domain and Auth host configuration, then complete an explicitly requested email on the intended customer/staff devices. Check expiry, reuse, resend, a link preview, the original-browser OTP fallback, both secure email-change recipients and the existing account/staff permissions. Resend acceptance alone is not inbox delivery; email delivery is not verified membership; membership is not owner access. In particular, the existing private owner bootstrap must still require the intended owner's Auth-verified email.

## Official references checked 5 November 2026

- [Lovable built-in backend](https://docs.lovable.dev/features/cloud)
- [Lovable managed custom emails](https://docs.lovable.dev/features/custom-emails)
- [Lovable Resend application connector](https://docs.lovable.dev/integrations/resend)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend SMTP settings](https://resend.com/docs/send-with-smtp)
- [Supabase Send Email Hook and secure email-change mapping](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase HTTP hook timeout and error contract](https://supabase.com/docs/guides/auth/auth-hooks)
- [Supabase email template variables, prefetching and tracking](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Standard Webhooks signature and replay specification](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)
- [Resend batch endpoint](https://resend.com/docs/api-reference/emails/send-batch-emails)
- [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Supabase upstream Auth mail dispatch and identity-unlink payload limitation](https://github.com/supabase/auth/blob/master/internal/api/mail.go)
