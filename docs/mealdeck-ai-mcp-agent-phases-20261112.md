# MealDeck — AI, agentic and MCP implementation gates

Reviewed: 12 November 2026. This document is an incremental engineering plan, not proof that a customer assistant is live.

## Existing boundaries

- The independent MealDeck database owns menu availability, choice validity, prices, payment, staff authority and delivery stages. Do not use the separate Dishbee project or migrate its records.
- The existing agent tool admission policy in src/lib/mealdeck-agent-guardrails.ts is planning-only and does not start, run or authorise an agent. It denies model-executed payment/refund, KDS release, inventory mutation, raw SQL and unrestricted MCP.
- The new src/lib/mealdeck-agent-menu-grounding.ts is a deterministic filter for future LLM-generated SKU IDs. It produces only trusted labels from a recently verified hydrated public menu and returns no model-authored prices, availability claims, allergen statements or descriptions.
- No model service, deployment secrets, remote MCP connection or customer-data processing has been enabled by this PR.

## Relevant open-source implementations to evaluate

- openai/openai-agents-js: TypeScript tools, guardrails, handoffs, tracing and human approval. Disable or redact tracing when customer content is sensitive; assess data retention, cost, availability and vendor terms before integration.
- modelcontextprotocol/servers: examples for read-only tool contracts only. Review each source and package independently; pin definitions and restrict permissions, network and credentials.
- adobe/react-spectrum: accessible focus, keyboard interactions, search inputs and overlays; retain MealDeck brand design and installed Radix components.
- TanStack/virtual: optional for lengthy admin/history lists, not the 79-item launch catalogue.
- OWASP MCP Security Cheat Sheet: tool definition integrity, least privilege, prompt-injection defence, trusted execution-time authorisation, audit and approval.

## Phase gates

1. P0 — Live commerce reliability: server-side £15 minimum after discount and 4-km Luton delivery, canonical stock/price and Stripe paid-to-KDS proof, physical Senraise auto-receipt and paper cut, stable order numbers, account/loyalty and branded communication acceptance.
2. P1 — Driver reliability: verified staff-and-driver pickup notification PR #254; test and deploy separately. GPS PR #255 stays off until full CI, privacy signoff, correct TTL/deletion and real-device acceptance.
3. P2 — Ordering experience: PR #257 improves shared desktop/mobile live menu search; complete keyboard, Samsung PWA safe area, iPhone PWA, basket/sheet and short-screen tests. Maintain multi-brand basket and live availability.
4. P3 — Read-only model pilot: model gets a public menu/FAQ and returns a bounded list of candidate SKU IDs. After the independent MealDeck server validates each ID using a fresh public snapshot, show only verified dish names and current source-computed prices. Allergen, ingredient, medication or dietary safety requests must go to a trained human with approved records. No customer address, order history or phone is sent to an open-ended model.
5. P4 — Staff-only AI operations: manually approved suggestions for stock replenishment, prep timing, demand forecasts, margin changes and customer-service handoff. Use approved aggregate metrics with tenant isolation; write actions require separate authenticated UI confirmation, server validation, immutable audit log and rollback.
6. P5 — Integration expansion: WhatsApp customer opt-in and catalogue-grounded chat; Uber Eats and Just Eat status via permitted provider integrations; no unauthorised scraping, device impersonation or bypass of marketplace access controls. Add kitchens only with independent tenant/menu/driver/printer scoping.

## Mandatory acceptance for every phase

- CI: Bun unit and adversarial suites; TypeScript; lint; build; isolated PostgreSQL 17 migration/role/consistency tests. No unresolved failures.
- Real-device: 320px, 390px, 768px and desktop; Android PWA navigation insets; iOS installed PWA; KDS on staff devices; printer cut/continuous printing; driver consent and revocation.
- Security: independent server-authenticated identity, explicit MCP tool allowlist, signed/approved definitions, no PII in tool logs, strict budgets, freshness/authority for every retrieved field, human review for risky operations.
- Truthfulness: no synthetic paid status, imaginary ETA, unapproved allergy assurance, unavailable SKU or model-created price.
- Production requires separately verified MealDeck backend configuration, migration checks, deploy readback and authorised real checkout/device acceptance. Source merge alone is not launch.

## Links

- OpenAI Agents SDK: https://github.com/openai/openai-agents-js
- MCP reference servers: https://github.com/modelcontextprotocol/servers
- OWASP guidance: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
- React Aria: https://github.com/adobe/react-spectrum
- TanStack Virtual: https://github.com/TanStack/virtual
