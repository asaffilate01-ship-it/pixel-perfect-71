# MealDeck individual-brand franchise recruitment

## Applicant journey

The homepage and Franchises navigation lead to `/franchise`. Applicants can explore the full MealDeck franchise or build a package from any number of the 15 shared marketing brands. Every approved brand has a promotional page at `/franchise/{brandId}` and appears in the sitemap. Brand categories, logos and food imagery come from the existing portfolio. Recruitment is independent from location-specific ordering availability.

The catalogue supports brand/cuisine search, food and drinks filters, a selected-only view and accessible add/remove controls. A selection summary leads to the enquiry. Brand pages preserve the existing choices and add the viewed brand when the applicant requests a proposal. The URL keeps selections across refresh and links; a local draft preserves the custom shortlist while comparing full MealDeck within the same hub visit.

Applicants select their starting point: an existing commercial kitchen or a new food business. Custom-package content explains equipment assessment and reuse, premises, training and a written proposal. Full-package content presents the indicative deposit-inclusive launch range and its specifically agreed premises, equipment and support offer. Selecting all individual brands remains a custom proposal, not automatic access to the full MealDeck contract or identity.

## Approved catalogue

`taconelle`, `paratique`, `tavo-chicken`, `loadd`, `sabzora`, `icova`, `vyta`, `moktl`, `tarka-box`, `skorch`, `pastarivo`, `nusara`, `rise-and-griddle`, `souvano`, `forvello`.

Café1 remains St Albans-specific. The legacy ordering entry for Fyrra is not part of the shared franchise catalogue. To add a future franchise brand, update the approved ID tuple, promotional data and marketing catalogue together, then verify its asset, detail page and enquiry validation.

## Pricing and scope

- The full MealDeck route displays an indicative £21,050–£33,500 all-inclusive launch range, including a two-month rent deposit allowance, with existing VAT treatment. The actual landlord deposit, location and scope determine the final written quote, which may fall outside the range. The private commercial brief records the illustrative basis; it is not a confirmed nationwide rent schedule.
- MealDeck holds the lease for its arranged premises and pays the landlord from the deposit included in the upfront quote. Do not charge it again separately. Rent, including the first month, is funded separately by the operator.
- Reflect premises an existing operator already provides. Include a new landlord deposit only where MealDeck supplies premises and one is required.
- If closure is due to a kitchen or MealDeck issue, the franchisee receives 50% of the landlord deposit actually recovered by MealDeck. Voluntary departure has no premises-deposit refund. The written premises terms confirm the conditions; the launch fee is not refundable under this deposit rule.
- Individual franchises, custom combinations and all ongoing charges are POA.
- The site does not calculate a price per added brand or quote additional territory rights.
- Existing territorial allocations apply to every enquiry route. Choosing a brand does not reserve or approve a location.
- Applicant, kitchen, location, training and supply readiness determine the agreed launch package.

## Intake contract

The existing same-origin `/api/franchise` endpoint forwards the validated enquiry to the server-configured `OMNIQORA_PUBLIC_API_URL`.

```json
{
  "existingKitchen": true,
  "answers": {
    "offerVersion": "2026-10-08-rent-deposit",
    "franchisePackage": "selected_brands",
    "selectedBrandIds": ["loadd", "skorch"],
    "setupPackageAcknowledged": true,
    "operatorResponsibilitiesAcknowledged": true
  }
}
```

This fragment shows the changed fields; the established name, contact, preferred area, consent and remaining required fields are still required. `existingKitchen: false` represents a new entrant. `full_mealdeck` requires an empty selected-brand list. Legacy requests omitting both new selection fields default to full MealDeck, but must still acknowledge the current offer version.

The upstream intake should retain the two new fields in its answers record so the team can prepare the requested proposal. Unknown/duplicate brand IDs, an empty custom package or mixed full/custom scope reject before upstream submission. The frontend shows a receipt only after a successful intake response. Missing endpoint configuration remains a service-unavailable response rather than an invented success. No payment, agreement or territory reservation occurs through this form.

## Promotion links

- One brand: `/franchise/skorch`.
- Two-brand enquiry: `/franchise?package=brands&brands=loadd,skorch#apply`.
- Brand campaign: `/franchise/skorch?utm_source=facebook&utm_medium=paid_social&utm_campaign=skorch-franchise`.
- Full concept: `/franchise?package=full`.

The five supported UTM fields survive the catalogue, brand detail and enquiry links. Only bounded single-line values are retained. SEO canonicals omit selection and campaign parameters.

## Verification

Run `bun install --frozen-lockfile`, the franchise regression suites, `bun run build` and the scoped ESLint command in `.github/workflows/verify.yml`. Verify one, two, three and all-brand selection paths, removal, detail links, shortlist preservation during comparison, existing/new entrant payloads, invalid brand recovery and mobile overflow. UI submission checks should intercept the local endpoint with a test receipt; do not create real applicant records for verification.
