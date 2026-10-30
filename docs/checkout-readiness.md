# Checkout readiness — first implementation

The ordering screen now explains preview, loading, closed-service and postcode
confirmation blockers. Phone/email keyboard types and address autocomplete help
mobile checkout. Coverage responses are tied to the checked postcode, fulfilment
and kitchen; superseded requests cannot change the selected kitchen. An in-flight
guard prevents duplicate clicks while creating an order.

The server no longer treats sample postcode coverage as live serviceability. It
maps Dishbee's tenant/location IDs against configuration, then checks coverage
again immediately before creating a checkout order. Database errors are not
returned verbatim to customers.

Validation:

```sh
node --test tests/checkout-readiness.test.mjs tests/checkout-server.test.mjs
```

The server suite invokes actual handlers with mocked transport and real input
validation. Its launch flag is overridden only inside the isolated test process;
production `COMING_SOON` remains unchanged. This is not a live payment test.

## Preview discovery and browser coverage

The launch preview uses the shared dish-first food taxonomy, shows the number
of matching dishes, resets category selection when changing kitchens, and provides
an explicit clear-filters action. It now supports £5/£10/£15 maximum base-price
filters and ascending/descending price sorting. Clearing filters resets search,
category, budget and sort. Preview prices are labelled as base prices; options and
delivery are not included. It remains browse-only.

Vegetarian discovery requires an explicit item name/category label; salad, plantain
or a brand's cuisine no longer imply that status. Savoury pies and sweet chilli
chicken no longer match the generic dessert rule. These are browsing categories,
not allergen guarantees. Saved-basket restoration refreshes existing line prices
and reports only the quantity actually added, without reducing a larger existing
quantity when the saved-basket cap is reached.

`npm run test:browser` starts a local Vite server and runs Playwright checks at
390px and 1280px. CI installs Chromium first. `BROWSER_TEST_BASE_URL` can target an
already-running staging server; these checks assume the launch preview is enabled.

Local validation: production build, TypeScript, targeted ESLint, 223 Bun
tests and 32 checkout Node tests pass. The browser test file passes syntax checking,
but browser execution is unverified: Chromium cannot create sockets in this runtime
and exits before opening a page. A passing build is not a visual/browser sign-off.

## Remaining launch dependencies

- Confirm the deployed Dishbee RPCs, tenant IDs and kitchen IDs match source.
- Prove payment-session creation, redirect/resume and signed confirmation through
  to paid-only KDS release. The current client only receives an order ID and
  handoff code; that is not a completed payment handoff.
- Verify authoritative delivery fees, current item/modifier prices and availability
  inside the database order transaction. A frontend/server preflight is not a
  substitute for database validation, especially for directly callable RPCs.
- Add persistent checkout idempotency for retries after uncertain network outcomes.
- Run full mobile/desktop Playwright journeys with the real configured integration
  in staging, including failure recovery and tracking. The new Node tests do not
  replace browser testing.
- Customer accounts/history, scoped agent tools and AI assistants remain separate
  implementation phases; no agent or MCP endpoint is enabled by this change.

Do not remove the launch flag until these dependencies have been verified.

## Preview shortlist

The launch preview now shares the existing device-local favourites format with the ordering page. Visitors can save or remove a dish and filter the current location to saved dishes; budget, category and search filters still apply. Clear filters preserves saved IDs. The shortlist stores at most 40 item IDs, not prices, personal information, basket contents or reservations. Unknown IDs remain outside the displayed catalogue. If persistence fails, the current visit still keeps its selection and explains the limitation. Controls wait for preference hydration before accepting changes.

Unit regressions cover storage success, storage failure and limit/removal behaviour. Browser scenarios cover mobile/desktop save, reload, remove, filter reset, blocked storage and continued launch protection. Browser execution remains outstanding due to the environment's socket restriction.
