# Monday 9 November member launch (1pm UK)

Owner-approved release: new MealDeck registration is held until **Monday 9 November 2026, 13:00 GMT**. Both the browser server policy and the authoritative PostgreSQL registration function use this boundary. Existing verified customers can sign in beforehand; anonymous and guest orders continue without eligibility for member-only offers or loyalty. No Google social sign-in is shown in the customer UI. Signup requires verified email, name and an E.164 UK/international phone number, with separate optional marketing/push consent.

The old 30% opening discount ends Sunday 8 Nov at 23:00 UK by existing server-clock promotion authority, and 99p milkcakes also expire at 23:00 independent of this change. Milkshake/milkcake inventory remains a separate operational state. Member promotion advertising does not grant pricing or loyalty automatically: until a specific future offer is implemented with server-side registered-customer checks, do not imply a discount has already been issued. The operational loyalty ledger is currently disabled; avoid promising a point earn rate before it is configured.

Branded Resend Auth templates and a signed hook exist in source but an actual Lovable Auth SMTP / Send Email Hook binding and verified email delivery must be confirmed by the owner/host. Do not enable a second Auth provider or expose a Resend key to the browser. See docs/mealdeck-auth-email-resend.md.

The compact header banner after Monday midnight prompts member registration and PWA installation while preserving 4km free delivery only when live backend confirms delivery open. It changes to an active registration CTA only when the server entry policy says registration is available.
