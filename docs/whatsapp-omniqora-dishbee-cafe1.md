# MealDeck WhatsApp, Omniqora, Dishbee and Cafe 1: controlled integration

> Historical record: the 4 November owner decision moved MealDeck's order authority to its **independent MealDeck database**. The 7 November pickup/kerbside implementation uses the official Meta Cloud API directly and is documented in [mealdeck-whatsapp-ordering.md](mealdeck-whatsapp-ordering.md). The shared-Dishbee/Omniqora architecture below is superseded for this release. Source implementation does not by itself establish live channel activation.

Reviewed against the MealDeck, Dishbee, Omniqora and Cafe 1 GitHub source trees on 1 November 2026. This is an implementation map and staged acceptance contract, **not a live activation claim**.

## What this change actually ships

- One narrowly-scoped **basket enquiry draft** for a verified WhatsApp Business number. It sends the location, preferred fulfilment and selected brand/dish/quantity/modifier _labels_. It sends **no** customer name, phone, address, email, item pricing, discounts, card details, payment state or kitchen-access credentials.
- A separate server-only contact lookup which requires the MealDeck launch gate to be open, the overall assistance feature to be enabled, and the requested location's official number to be individually marked verified. Fail closed on any absent/invalid configuration.
- A guarded, accessible "Ask about this basket" control within the existing cross-brand basket, reusing the established dark app tokens.
- A real food-photo-led, high-contrast **preview** with illustrative-image/price labels and a truthful _WhatsApp coming soon_ explanation.
- Unit tests for phone validation, encoded links, cross-brand drafts, privacy, invalid quantities and control-character stripping, plus additional CI coverage.

**Explicit limit:** This phase opens a drafted conversation only. It does not provision a Meta business account, read an actual WhatsApp thread, accept orders from chat, call an AI model, create payment links, release KDS tickets or enable production orders. With `COMING_SOON = true`, the live basket handoff remains unavailable.

## Authoritative source ownership

| Product                         | Responsibility                                                                                                                                          | Existing evidence in source                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MealDeck `pixel-perfect-71`     | Consumer catalogue presentation, one cross-brand basket, postcode/fulfilment UX, client order tracking, franchise pages                                 | `src/routes/order.tsx`, `src/lib/dishbee.functions.ts`, `src/lib/launch-status.ts`                                |
| Dishbee `dishbee-helper`        | Tenant/location mapping, real menu and modifiers, server-authoritative prices, assisted ordering, EPOS/KDS, central pass, dispatch and provider adapter | `docs/MEALDECK_RUNTIME_INTEGRATION.md`, `src/server/hive-whatsapp.ts`, `docs/SECURE_WHATSAPP_COMMERCE.md`         |
| Omniqora `seamless-comms-suite` | Verified WhatsApp channels, inbound/outbound messaging, customer relationships, AI/tool orchestration, approval and audit                               | `docs/OMNIQORA-CONNECT.md`, `src/lib/whatsapp.functions.ts`, `src/modules/connect/order-intake.service.server.ts` |
| Cafe 1 `cafe1-connect-dash`     | Independent merchant EPOS, tills, station KDS, SumUp, HMCTS/juror voucher workflows, loyalty, inventory, shifts and accounting controls                 | `README.md`, `docs/PRODUCTION_RUNBOOK.md`                                                                         |

Cafe 1 direct EPOS transactions, vouchers, staff pricing and cash/card reconciliation must never be flattened into a generic anonymous MealDeck checkout. St Albans MealDeck's launch channel is **delivery only**; Cafe 1's independent pickup/counter/dine-in options have a different operational boundary. Do not expose restricted staff/jury menus via a marketing or chatbot route.

## Verified WhatsApp order lifecycle (future work)

1. **Identify:** An approved Meta WhatsApp number maps to an exact Omniqora product, tenant and location. Verify the inbound signature, idempotency, consent and approved scopes. Never trust a phone number or tenant ID in a customer query parameter.
2. **Understand:** Omniqora can ask clarifying questions and propose a basket from Dishbee's _current location- and channel-filtered catalogue_. An AI agent may recommend dishes but may not invent stock, allergens, prices or fulfilment availability. It must escalate uncertain cases to staff.
3. **Quote:** Dishbee resolves item/SKU/brand/modifier IDs, validates location and serviceability, and reprices server-side including configured discounts, fee rules and delivery quotation. Do not accept prices/discounts or roles supplied by chat.
4. **Confirm:** Show a consolidated order across all brands and fulfilment choices. Capture the delivery destination privately in a verified, expiry-limited session, never a public URL.
5. **Pay:** Create an authorised hosted checkout through the approved Dishbee payment provider. Verify merchant/tenant, amount, signature and idempotent webhook server-side. Never let a chat message, receipt image or return redirect mark an order paid.
6. **Prepare:** On genuinely confirmed payment (or a narrowly authorised account/tab exception), Dishbee releases the normal order to station KDS and the shared MealDeck pass; one dispatch flow covers the packed multi-brand basket.
7. **Inform:** Dishbee emits lifecycle events to Omniqora through its scoped runtime outbox. Omniqora sends approved WhatsApp updates, allowing human escalation and opt-out; keep retries and usage metering idempotent.
8. **Reconcile:** Handle duplicate webhooks, rejected payment, expiry, no-response, provider cancellation, refunds and partial fulfilment. Audit each state transition, and reconcile Cafe 1 mappings and relevant settlement separately.

Do not introduce a second checkout, an independent MealDeck order database, a second CRM or a replacement EPOS. For the real runtime bridge, reuse Dishbee's `docs/OMNIQORA_RUNTIME_CUTOVER.md` and Omniqora's `POST /api/platform/order-intake` scoped handoff. Treat its existing `handoff.claim` and `handoff.ack` contract as _back-office_ operations, not public customer methods.

## AI agents and MCP tools: strict authority

**Read-only before staged approval:** postcode/serviceability, approved menu/price, allergens as supplied by operator, current order status, FAQ, basket suggestions, safe chat handoff. Every tool must be tenant/location scoped; expose no provider secrets, personal contacts or private food-safety details.

**Human approval required:** replacing unavailable items, sensitive/allergen ambiguity, restricted staff/juror access, refunds or goodwill credits, payment/account exceptions, dispute resolution. Persist agent/tool arguments, identity, approvals and results without storing credentials.

**Never delegated to a model:** final prices/discount validity, "paid" state, card verification, KDS release, ledger settlement, inventory decrement, franchise territories or supplier invoices. The source system enforces these irrespective of prompts.

Use an MCP server to make _allowlisted_ read-only Dishbee operations available to Omniqora, with a stable versioned tool schema and human-reviewed extensions. No public unauthenticated agent endpoint.

## GitHub reference shortlist: adapt, don't bulk-install

| Reusable project                              | MealDeck relevance                                                  | Decision                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Leonxlnx/taste-skill`                        | Existing UI critique, deliberate visual hierarchy and browser check | Design method, no runtime dependency                                                                       |
| `pbakaus/impeccable`                          | A11y, copy, responsive, focus and state quality                     | Design review method                                                                                       |
| `VoltAgent/awesome-design-md`                 | Design-system examples                                              | Inspiration only; preserve MealDeck assets                                                                 |
| `assistant-ui/assistant-ui`                   | Future first-party chat interface with tools and human handoff      | Evaluate **only after** Omniqora agent contract                                                            |
| `mastra-ai/mastra`                            | Typed agent workflows, model routing and approvals                  | Consider as Omniqora-side orchestration, not a second MealDeck agent stack                                 |
| `modelcontextprotocol/typescript-sdk`         | Typed permission-scoped interoperability tools                      | Use for an approved internal MCP bridge                                                                    |
| `inngest/inngest`                             | Durable event/notification retries                                  | Compare with existing Dishbee outbox before adding infrastructure                                          |
| `dequelabs/axe-core` / `microsoft/playwright` | Automated accessibility and mobile/desktop regressions              | High-priority release QA                                                                                   |
| `Project-OSRM/osrm-backend`                   | ETA/travel-time calculations for dispatch                           | Optional **behind** Omniqora routing / Dishbee delivery engine; do not calculate guest fees in the browser |
| `PostHog/posthog` / OpenTelemetry             | Event funnel and service tracing                                    | Use with consent, PII minimisation and source-of-truth metrics                                             |

Review licence, dependency health, privacy and hosting costs before adopting any external package. "Thousands of GitHub repos" should be treated as a discovery universe, not thousands of dependencies or a claim that every repository was independently audited.

## Activation acceptance checklist

- [ ] Confirm the exact MealDeck Dishbee tenant and distinct St Albans/Luton location UUIDs, channel flags, available primary/add-on brands and restricted menus in staging.
- [ ] Resolve draft MealDeck hosted payment/tenant PR #17 and Dishbee PR #63 with passing build, migration replay, webhook and KDS tests; then complete controlled production deployment.
- [ ] Register verified Meta WhatsApp Business channel(s) in Omniqora with separate tenant/location bindings, approved templates and server-only secrets; verify inbound signatures and human fallback.
- [ ] Ensure the Dishbee↔Omniqora runtime token/permissions, scope maps, event idempotency and signed-off shadow handoff; do **not** cross-tenant route Cafe 1.
- [ ] End-to-end test: two-brand basket, required modifiers, postcode, quoted delivery, paid/declined/expired checkout, duplicate callback, station KDS, pass, dispatch, refund and customer notification.
- [ ] Test opt-out, consent, support escalation, allergen ambiguity, fraud, rate limiting, retention and cross-tenant negative cases.
- [ ] Verify responsive UX, keyboard access, real device messaging and customer-facing status; record actual evidence and rollback.
- [ ] Only then deliberately lift the MealDeck launch gate and set each official number's verified flag and the overall assistance flag.

## Reference status

This branch changes MealDeck application code and documentation **only**. Dishbee, Omniqora and Cafe 1 source trees were read for integration direction, not changed or deployed. No provider credentials, production tables or merchant settings were accessed or changed.
