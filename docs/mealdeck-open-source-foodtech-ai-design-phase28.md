# MealDeck Phase 28: Food-tech, delivery, design and agent ecosystem audit

**Research date:** 3 November 2026. **Scope:** source review of MealDeck/Dishbee boundaries, selected public GitHub repository metadata/READMEs, and changes proposed in Phase 28. This is an **evidence-based shortlist, not a claim to have individually audited thousands of repositories**. Broad GitHub food-ordering/restaurant-management listings contain thousands of candidates, but only a defensible subset is relevant to the existing platform. This document is a design and engineering evaluation; no third-party application code or model weights have been imported.

## Product boundary: keep one order authority

**MealDeck = discovery, cross-brand basket, quote presentation, customer UX and loyalty.** **Dishbee = trusted tenant/location, live menus and modifiers, price computation, Adyen payment and split ledger, KDS, master pass, courier selection, tracking and reconciliation.** **Omniqora = optional AI, WhatsApp, messaging, CRM and assisted support, with explicit permissions.** **Café1 counter/EPOS and restricted juror flows stay distinct from MealDeck.**

A 4-brand order must produce **one master order and one payment intent/session** for the customer's agreed checkout; Dishbee apportions the canonical lines to branded stations; it releases none for preparation until the **entire required payment is verified captured/settled according to the agreed release policy**. Preparation is complete only after every required station has acknowledged readiness, then dispatch is booked **once**. All KDS item notes, modifiers, common allergen warnings, staff edits, cancellation and delivery attempts need an auditable state transition. Shared payments must not cause premature ticket release or a second delivery fee. Model responses, frontend state and webhook payloads without verified provenance are never financial authority.

The customer journey should read naturally: **enter postcode → choose the actual eligible kitchen → browse categories/brands → customise dishes → see one basket → get one server-priced quote → pay alone or invite contributors → await all captured shares → receive one tracking experience and verified handoff**. The prelaunch sample mode may teach this model but must not assert a live kitchen is open.

## Tier 1: audited reference projects by engineering use case

| Public project | Evidence/technique to study | Adopt / avoid |
| --- | --- | --- |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill) (MIT) | Audit-before-redesign, purposeful visual hierarchy, context-aware typography, real browser checks | **Use review method.** Retain MealDeck's red/cream/black, genuine owned logos, card motif and food imagery; do not install unreviewed scripts or reset existing tokens |
| [Impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) | `critique`, `audit`, `polish`, `adapt`, `harden`; inspect responsive design, copy, keyboard, failure states | **Use review method.** Prioritise location/postcode, category, menu, basket and checkout; local CLI/browser automation not run in this PR |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) (MIT) | Long-lived product-specific design documentation | **Reference only.** Keep `DESIGN.md` authoritative; no copied third-party brand styling |
| [TastyIgniter](https://github.com/tastyigniter/TastyIgniter) (MIT) | Restaurant online ordering, fulfilment and multi-location operations | **Study** scheduling, kitchen exceptions, availability and order flow; **do not** swap Dishbee for another ledger or deploy a parallel PHP backend |
| [ElitaleRestro](https://github.com/elitale/restro) (AGPL-3.0) | POS, order state, KDS stations, table/QR, inventory and manager operations | **Concepts only.** AGPL requires deliberate licensing evaluation before any code use |
| [Bocao](https://github.com/nicotordev/bocao.app) (AGPL-3.0) | Multi-tenant roles, kitchen kanban, WhatsApp, order status, analytics | **Concepts only.** No code copying; vet maintainability, test coverage and AGPL duties |
| [Satisfecho POS](https://github.com/satisfecho/pos) (AGPL-3.0) | Tenant-aware real-time restaurant POS, kitchen and menu state | **Inspiration only.** Separate order engine would introduce sync and settlement faults |
| [URY Mosaic](https://github.com/ury-erp/mosaic) (AGPL-3.0) | Kitchen display and KOT printing interaction | **Inspiration only.** Validate actual station workflows with Café1 and Dishbee staff |
| [Medusa](https://github.com/medusajs/medusa) (licensing varies by component) | Composable order modules, discount rules, carts and events | **Architecture study.** Do not add a second checkout source of truth |
| [Saleor](https://github.com/saleor/saleor) (BSD-3-Clause) | GraphQL/channel permissions, clear commerce domain boundaries | **Architecture study.** Avoid introducing GraphQL solely to reimplement existing RPCs |
| [VROOM](https://github.com/VROOM-Project/vroom) (BSD-2-Clause) | Multi-stop route optimisation for an owned fleet | **PoC behind Dishbee** only if multiple drivers and concurrent trips warrant routing optimisation; never infer a courier booking from an optimiser |
| [OSRM](https://github.com/Project-OSRM/osrm-backend) (BSD-2-Clause) | Grounded route distances/travel-time matrix | **Evaluate** own-fleet cost/ETA input, with road network update policies; treat ETA as estimate, not guarantee |
| [BullMQ](https://github.com/taskforcesh/bullmq) (MIT) | Deduplicated queueing, job retries, delayed processing | **Conditional adoption** if existing transactional outbox is insufficient; event idempotency in Postgres remains mandatory |
| [Temporal TypeScript SDK](https://github.com/temporalio/sdk-typescript) (MIT) | Durable business workflows with retries and compensation | **Evaluate later**, only after failure modes justify the operational footprint |
| [Playwright](https://github.com/microsoft/playwright) (Apache-2.0) | Real browser mobile, keyboard and multi-viewport testing | **Preferred QA add-on**, not added in this PR; test at 320px, 390px, 768px and desktop |
| [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0) | Automated a11y checks for accessible roles, focus and WCAG criteria | **QA tool**, supplemented by manual keyboard, screen reader and contrast inspection |
| [MSW](https://github.com/mswjs/msw) (MIT) | Mock and replay unreliable provider/serviceability/checkout responses | **Test candidate** for Dishbee, Adyen and delivery sandbox scenarios, never as production authority |
| [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js) (Apache-2.0) | Trace propagation across async events | **Conditional observability**, with order ID correlation and PII/secret redaction |
| [Open Food Facts JS](https://github.com/openfoodfacts/openfoodfacts-js) (Apache-2.0) | Structured retail food metadata | **Not an allergen authority** for prepared restaurant dishes; operators must attest recipes and cross-contact data |

Licences above are repository-level metadata from the research date; before importing a subpackage, confirm **its own licence, dependencies, security posture and commercial suitability**. A promising README is not evidence that a project is production-safe.

## Tier 2: AI agents and MCP — deliberately narrow

| Public project | Useful pattern | Boundary |
| --- | --- | --- |
| [OpenAI Agents SDK JS](https://github.com/openai/openai-agents-js) (MIT) | Server-side tool schema validation, agent orchestration, handoffs, tracing and evaluations | Optional **Omniqora** tool orchestration behind Dishbee RBAC, rate limits, human escalation and a PII minimisation contract |
| [Google ADK JS](https://github.com/google/adk-js) (Apache-2.0) | Tool contracts, workflow evaluation and observability | Alternative pilot, not a second agent framework running the same customer interaction ungoverned |
| [Claude Code official plugins](https://github.com/anthropics/claude-plugins-official) (Apache-2.0 repository) | Reviewed developer assistance for test/design/security tasks | Development only; plugins never receive payment keys, raw customer records or unrestricted Supabase credentials |
| [MCP reference servers](https://github.com/modelcontextprotocol/servers) | Reference patterns for tools and transport | **Not production-ready examples.** Create a private allowlisted gateway, not a generic SQL, shell or unrestricted web-fetch gateway |

**Safe AI tool scopes:**

- **Menu concierge**: read only published, location-scoped Dishbee menu, item names, human-reviewed tags, prices explicitly labelled as *estimates* when not quoted; no allergen guarantees.
- **Basket assistant**: suggest combinations or modifiers from trusted catalogue rows, but never alter priced orders outside a user-reviewed authenticated checkout.
- **Customer status assistant**: read only a specifically verified order with secure server binding. Never let a model guess the order UUID or share handoff codes.
- **Kitchen copilot**: analyse anonymised delays, recipes, COGS anomalies, stock shortages or refund patterns; suggest actions for manager approval, never autonomously pay, refund, release KDS or alter allergen metadata.
- **Support/WhatsApp assistant**: consent-aware, opt-in assistance, explicit escalation for disputed charges, allergens, delays and substitutions. A chat is not payment confirmation.
- **Franchise/operations analyst**: tenant- and brand-scoped aggregate analytics, no unrestricted payroll, banking, customer lookup, recipe IP or cross-franchise leakage.

Tools in `src/lib/mealdeck-agent-guardrails.ts` already deny transactional and generic MCP/SQL tools. Keep this as a fail-closed admission **policy** only; it is not a deployable authenticated agent. For each future tool: assign the authenticated actor on the server, bind tenant/location, validate inputs, cap cost/time/calls, log redacted trace IDs, use read-only permissions by default, and require human approval for every consequential write.

## Tested or changed in this PR (source only)

1. **Food first:** the ordering preview presents actual menu browsing and the sample multi-brand basket before explaining secondary features. Preserve the existing red/cream/black identity and approved visual assets.
2. **Multi-brand quantities:** sample dish count can exceed one; quantity steppers have at least 44px control size, branded lines, line subtotals and one illustrative total. All money is integer pence. Basket sizes and amounts are capped, duplicate line IDs rejected.
3. **Group planning accuracy:** illustrative equal-share calculation uses *quantities*, so inviting three people shows shares from the actual sample goods subtotal, with delivery explicitly excluded until Dishbee quotes it.
4. **Dietary truthfulness:** the “Vegetarian” discovery filter no longer infers suitability from the dish's name, a “salad” substring or the brand's cuisine. It only recognises explicit item-level `Vegetarian`/`Vegan` category text; this **still is not** allergen assurance. Live dietary filtering requires signed-off structured data and cross-contact review.
5. **Regression gates:** add dedicated pure sample-cart tests and run them in the existing GitHub workflow with marketplace tests; existing checkout/tenant release gates unchanged.

**Not changed:** Dishbee live DB, payment processing, Adyen split settlements, courier providers, real KDS, customer orders, production flags, secrets, Supabase migrations and Lovable build. These remain gated until verified staging acceptance. No product photo/logos were generated or modified.

## Staged next-phase decisions

### P0 — no production launch until these pass

- Audit Dishbee multi-tenant RLS and brand/station permissions. Enforce one canonical checkout order and locked transaction-wide split ledger; signed and replay-resistant Adyen webhooks, capture/refund/chargeback reconciliation, idempotent KDS release **after all required shares**.
- Rehearse cancellation/substitutions, item notes, allergens, duplicate client taps, provider webhook retries, poor network, split guest timeout, partial capture and rebook/retry; measure no duplicate dispatch and no cross-tenant reads. Verify real Adyen and courier sandbox/test credentials exist and are server-only.
- Verify Luton and St Albans serviceability, delivery/pickup/kerbside policy and restricted Café1 menus from canonical Dishbee configuration. Never show advertised services as live based only on postcode prefixes.

### P1 — conversion, KDS, fulfilment

- A single accessible postcode-first storefront; photo-led menu and exact brand logo asset mapping, account/favourites, honest out-of-stock, modifiers and verified offers. Add cross-brand contextual extras only from the *current eligible* menu.
- Kitchen receives **brand/station-specific tickets** with item and order notes, modifiers, allergy flags and an all-stations-ready master pass. Allow staff corrections before payment only according to role/ledger policy; track controlled post-payment changes through refund/re-authorisation as applicable.
- Delivery selection considers **availability + true delivered cost + ETA + service quality** across authorised in-house drivers, Uber Direct, Deliveroo Express, Just Eat Go and Stuart where contracted. One provider per master delivery, staff-visible exceptions, proof-of-handoff code and verified tracking; provider capabilities must be contract-checked.
- Mobile checkout with clear full-price summary, real delivery fee, Apple Pay/Google Pay only through the supported authenticated payment provider, account security and explicit group invitation status. MealDeck never fabricates “free delivery” or a discount.

### P2 — responsible intelligence and unit economics

- Use historic tenant-scoped data to evaluate recommendations and offers with **incremental margin**, not simply basket size; build A/B testing and offline replay before personalising. Consent, provenance and exclusions matter.
- Forecast ingredient demand using recipes, actual portions, stock batches, expiry, seasonal shifts and supplier lead time; alert managers rather than order supplies without approval.
- Build finance and franchise profitability reporting using reconciled processor/aggregator fees, labour, packaging, royalties, COGS and refunds, with a visible estimated-vs-settled status.
- Reconsider routing engines/queues after measured throughput and incident evidence, not before.

## Release and review checklist

- **UX:** real screenshots at 320/390/768/desktop, keyboard-only path, zoom 200%, reduced motion, contrast, no horizontal scroll, loading/empty/failed states, screen reader names, focus return from modal, 44px touch targets and order status clarity.
- **Code:** Bun regression suite; TypeScript, ESLint; no new unreviewed dependencies, third-party code or native asset modifications.
- **Payments/ops:** replayable sandbox fixtures, strict tenant/authority checks, idempotent event ledger, one dispatch, no ticket before capture; staff-visible incident states and approved override auditing.
- **Deployment:** no production checkout, no provider onboarding claims and no real-payment claims without signed acceptance. Review and merge only after CI succeeds. If browser screenshots or sandbox evidence are unavailable, document that explicitly.

**References and local context:** `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `docs/mealdeck-ai-github-design-audit-phase19-21.md`, and the existing fulfillment/payment/Dishbee phase guides. This shortlist should be refreshed before decisions involving external versions, contracts, security or pricing.
