# MealDeck post-launch storefront roadmap — 25 November 2026

## Scope
Retire expired public campaign copy, redirect the old opening-offer URL, remove it from sitemap, and align delivery copy and order-first CTA. Historical pricing rules, orders, receipts, and server expiry remain unchanged. No production database or payment settings are changed.

## Phases and acceptance
- P0 — Paid-only KDS, Stripe webhook idempotency, sequential order numbers, physical H10S receipts, live 4 km/£15 delivery, slot and group-payment recovery tests.
- P1 — Benchmark mobile LCP, INP, CLS, API p95 and checkout completion. Optimize measured bottlenecks with lazy routes, responsive images, deduplicated availability calls and safe cache policies.
- P2 — Order-first landing, clear method chooser, thumb-friendly mobile navigation and checkout, tablet split view and desktop sticky basket. Test 320/390/768/1024/1440 px and installed PWAs.
- P3 — Secure customer account/order history, reorder with live repricing, timeline, loyalty and guest recovery. No simulated GPS.
- P4 — Role-scoped KDS, operations, printer, driver and franchise dashboards; cross-tenant denial, event deduplication and audit tests.
- P5 — Public menu/FAQ read-only assistant, fresh canonical SKU/price/stock validation; no autonomous payments, refunds, KDS release, allergen claims or customer PII exposure. Ops proposals require staff approval.
- P6 — Verified WhatsApp, aggregator and provider adapters; no activation without real credentials and device tests.
- P7 — Continuous accessibility, performance, security and release validation with browser QA, existing Bun/TypeScript/SQL tests and independent production readback.

## References (not installed)
- https://github.com/microsoft/playwright-mcp — browser and accessibility QA.
- https://github.com/supabase/mcp — restricted development/read-only schema checks.
- https://github.com/stripe/ai — hosted Stripe MCP, read-only diagnostics; avoid deprecated agent toolkit.
- https://github.com/openai/openai-agents-js — tool schemas and guardrails.
- https://github.com/tirforge/restro — menu, POS, KDS and inventory patterns.
- https://github.com/adobe/react-spectrum — accessible controls and focus.

Source, CI, merge, deployment, live URL readback and real-device acceptance are distinct gates.
