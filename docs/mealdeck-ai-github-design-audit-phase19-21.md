# MealDeck code, design and agent capability audit — 3 November 2026

## Purpose and evidence boundary

This is a curated, risk-ranked survey of relevant GitHub projects and official AI-agent guidance. It is **not** a claim to have reviewed every GitHub repository. We read repository READMEs and MealDeck's source/PRODUCT.md/DESIGN.md, checked CI, and converted selected patterns into first-party implementations. No external code or model weights were copied, and no live ordering, Adyen, courier or kitchen operation was activated.

### Design lenses

| Reference | Relevant technique | MealDeck decision |
| --- | --- | --- |
| [Taste Skill](https://github.com/senlindesign/taste-skill) | Extract visual principles and rationale, not merely colours | Maintain existing MealDeck brand/card/food composition; use one clear shopping hierarchy |
| [Impeccable](https://github.com/pbakaus/impeccable) | Critique, audit, polish, mobile adaptation and accessibility checks | Clear active filter states, meaningful empty results, readable group-share breakdown |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) | Durable design constraints for agent-led changes | Preserve PRODUCT.md and DESIGN.md as source of design and product truth |

These frameworks are references, not design assets or executable copy/paste dependencies. The current design needs real screenshots at 320/390/768/desktop and keyboard/touch testing before claiming a pixel-perfect outcome.

### Industry architecture survey

| Open-source reference | Pattern worth considering | Decision and risk |
| --- | --- | --- |
| [ElitaleRestro](https://github.com/elitale/restro) | POS, kitchen station queue, stock auto-depletion, manager review and QR order interaction | **Inspiration only**: AGPLv3 licensing; do not copy proprietary-application code |
| [Bocao](https://github.com/nicotordev/bocao.app) | Multi-tenant RBAC, order kanban, kitchen stages, WhatsApp workflows, analytics, customer support | **Inspiration only**: AGPL-3.0; review the commercial licence if considering direct reuse |
| [TastyIgniter](https://github.com/tastyigniter/TastyIgniter) | Multi-location food ordering, availability, fulfilment controls | Examine integration boundaries; not a drop-in replacement for Dishbee |
| [Vendure](https://github.com/vendure-ecommerce/vendure) | TypeScript plugin boundaries and modular commerce workflows | Study extension architecture only; do not migrate MealDeck to a second order ledger |
| [Open Food Facts](https://github.com/openfoodfacts/openfoodfacts-js) | Structured food product metadata | Retail product data is not authoritative allergen documentation for restaurant dishes |

### Multi-model AI/agent pattern review

| Provider/reference | Reason to consider | Boundary |
| --- | --- | --- |
| [OpenAI Agents SDK for TypeScript](https://github.com/openai/openai-agents-js) | Zod tool schemas, model handoffs, guardrails, approval and tracing | Optional Omniqora/Dishbee server integration after observability, cost and legal review |
| [Claude Code official plugin directory](https://github.com/anthropics/claude-plugins-official) | Curated skills and MCP plugins with explicit permission controls | Development-only curated/approved code-review and design agents; no direct transactional credentials |
| [Google ADK](https://github.com/google/adk-docs) | Model-independent tools, evaluations, tracing and constrained multi-agent flows | Evaluate alternatives behind one neutral service API, not several conflicting order engines |
| [Supabase](https://supabase.com/docs/guides/api/securing-your-api) | RLS, narrow RPCs, SQL/security advisors, auth and audit | Canonical Dishbee tenant, order, payment and KDS authority stays server-side |

**MCP recommendation:** use a centrally allowlisted Omniqora gateway, with tool-level timeouts, tenant/location scope, per-user identity, trace redaction, request budgets, approval workflow and a human support handoff. Never expose generic SQL, arbitrary fetch, broad read/write service-role access or external delivery/payment APIs as unrestricted agent tools. The Phase 20 module is a **pure denial/permission decision**, not a deployed agent or authenticated service.

## Implemented in Phases 19–21 (source only)

1. **Phase 19 — Multi-brand group contribution planning.** Equal and itemised penny-accurate shares; deterministic remainder; exact quantity assignment; optional host-paid or one shared delivery fee; rejection of duplicated or unallocated items and overflows. A non-transactional UI preview now displays exact illustrative equal shares.
2. **Phase 19 — Menu discovery polish.** Category chips, accessibility-friendly pressed state, filtered dish count, clear-filters empty state. Changed St Albans MealDeck to delivery-only; Café1 counter menus remain separate.
3. **Phase 20 — Model/tool guardrails.** Only explicitly named public-catalogue, verified-customer-status or scoped aggregate-analysis reads can be admitted by a server-provided trusted context. Model-suggested payments, refunds, KDS releases, courier bookings, unknown MCP tools, SQL and customer search are denied. Allergens require human escalation.
4. **Phase 21 — Staff order review watchlist.** Read-only, deterministic suggestions based on canonical order timestamps and status, including recorded-paid cancellation, contradictory pending status, old preparation states and unresolved payment-pending checkout. All warnings are labelled **unverified operational reviews**, not assertions about provider or courier incidents.

Nothing here calls live payment, KDS, tracking provider, bank, external AI-model or courier APIs. Customer COMING_SOON remains enabled.

## Prioritised next engineering programme

**P0 before launch — security and financial correctness.** Real approved Dishbee staging migrations and tenant FK/RLS review; server-side split allocation persisted under lock; Idempotent Adyen for Platforms webhooks and settlement events; no KDS before full captured group payment; provider sandbox invoice and delivery reconciliation; independent security, accessibility and operational acceptance. Test unauthorised cross-tenant reads and webhook replays.

**P1 — actual daily kitchen operations.** Live per-brand station KDS mapped from Dishbee; item and full-order notes, modifier clarity, line completion, all-stations-ready pass, single courier dispatch; staff-ready incident review with verified provider/KDS state, controlled notifications, carrier retries and human override.

**P1 — better conversion experience.** Live postcode quote, filters based on verified dish metadata and allergens (human-reviewed), cross-brand upsells only if available, one master checkout, user invitations/item-assigned shares, order history and transparent code-based handoff; accessibility, small viewport and performance acceptance.

**P2 — connected intelligence.** Omniqora model-routing and documented tool budgets; opt-in WhatsApp enquiries converted to Dishbee orders only after real confirmation; customer preference and loyalty with appropriate consent; incident summaries, stock and margin anomaly suggestions; PII-minimised tracing and evaluation harness.

**P2 — franchise & financial detail.** Site/brand-level product and packaging COGS, approved recipes, supplier receipts, wastage, labour, channel fees and actual processor settlements; finance reports must distinguish estimated from reconciled figures.

### Evaluation and release contract

- No unrestricted agent can call payment, KDS, delivery booking, refunds or private finance tools.
- A group-order plan must conserve exact pennies and item quantity; no duplicate delivery fee.
- Every actual MealDeck order and station must be bound to one authenticated Dishbee tenant/location/order before any KDS or courier action.
- Live allergen claims require approved recipe and cross-contact evidence; a text model may not certify allergens.
- Test signed-in and anonymous states, narrow-width/touch navigation, reduced motion and no invented availability or payment status.
- Run GitHub CI on the exact reviewed merge commit and approved staging checks; never claim that CI proves live payment/provider integrations.
