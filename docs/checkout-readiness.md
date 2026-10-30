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
