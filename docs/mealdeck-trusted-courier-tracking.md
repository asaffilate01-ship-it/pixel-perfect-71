# Trusted external courier tracking links

## Security boundary
MealDeck's tracking endpoint previously forwarded the `tracking_url` supplied by the Dishbee public tracking RPC to a customer-facing link without constraining its destination.

An incorrect provider record could therefore lead a customer from a trusted MealDeck tracking screen to an unintended external website. This change verifies the link **on the server**, before adding it to the response.

## Implementation
- `safeCourierTrackingUrl` returns only HTTPS URLs matching a configured hostname (or its subdomains).
- It rejects non-HTTPS protocols, credentials, non-default ports, malformed or oversized URLs, IP/local network addresses, unapproved hosts, and deceptive hostname suffixes.
- It strips fragments. The path and query are retained, because legitimate courier tracking URLs can use an opaque reference or token.
- Links are returned only when the authoritative order fulfilment is `delivery`.
- Without approved host configuration, external links do not appear; MealDeck's own in-app tracking status still works.
- No changes are made to provider secrets, courier booking, HMAC code verification, payment processing, KDS dispatch or launch flags.

## Configuration
Set `MEALDECK_TRACKING_ALLOWED_HOSTS` **server-side only**, as a comma-separated list of actual vendor tracking hostnames independently verified against the contract and staging links. Do not put this value behind a `VITE_` prefix, and do not use wildcard, root public suffix, arbitrary third-party redirect domains or example/test hosts in production.

Sample format (not real courier domains):
`MEALDECK_TRACKING_ALLOWED_HOSTS=tracking.example.test,parcel.example.test`

Provider links can redirect after the customer clicks. Review vendor redirect behavior and require that provider operators keep the underlying tracking page on the verified domain where possible.

## Release checks
1. Validate the supplied tracking URL format for each enabled courier provider against a real staging order.
2. Confirm vendor hostnames with official provider documents and configure only those exact domains.
3. Verify that a fallback/v1 Dishbee tracking RPC does not leak internal fields, credentials or unapproved links.
4. Enforce per-order tracking RPC rate limiting and throttled code-guess protection on the backend (4-digit order codes alone are insufficient as a security control).
5. Test successful delivery, failed quote, cancelled provider booking, customer tracking privacy and no-link fallback before live activation.

Run `bun test tests/mealdeck-tracking-links.test.ts` plus the standard build and TypeScript checks.
