# MealDeck responsive release QA — 27 November 2026

## Implemented navigation changes
- Promote My account to the desktop navigation; move account access near the top of the mobile/tablet menu. Staff sign-in remains a separate footer entry. Preserve existing verified staff/customer auth and direct ordering paths.
- Change Play & Rewards to Play games in site navigation: games are entertainment, not a way to earn food, prizes, vouchers or loyalty.
- Retain Track order / coming soon guidance in the mobile menu and footer instead of using scarce desktop navigation width.
- Mobile disclosure closes on Escape with focus restored, on outside interaction, and when transitioning to desktop. Keep its aria-controls target mounted but hidden; make the menu scrollable at the same 1180px breakpoint that displays it.
- Keep the established text-only centre order CTA and approved MealDeck logos.

## Browser acceptance
The new workflow is independent from financial and database release workflows. It uses a local Vite dev server with no credentials and disabled checkout/promotion flags; Chromium and WebKit context requests are restricted to localhost and service workers are blocked. Run from Actions or when the reviewed navigation files change. Playwright 1.58.2 and axe-core 4.11.1 are isolated QA-only dependencies (exact top-level pins; application lockfile unchanged). It collects 56 route/viewport cases (6 Chromium and 2 WebKit profiles x 7 routes), structural checks, viewport screenshots, aggregated axe rule findings, horizontal overflow and local navigation timings. Structural assertion failures fail the workflow; existing accessibility/layout findings are reported for triage, not silently declared compliant. No production order/payment, PII, provider key or customer sign-in is used. Results from actual workflow execution are required before claiming browser acceptance. Development server timings are not production benchmarks.

## Open-source and agent review
Reviewed official repositories:
- https://github.com/microsoft/playwright — use real browser contexts, semantic locators, keyboard and viewport tests.
- https://github.com/dequelabs/axe-core — automated WCAG checks with human review for unresolved findings.
- https://github.com/GoogleChrome/lighthouse — candidate next production performance baseline; do not compare dev timings to production Lighthouse scores.
- https://github.com/openai/openai-agents-js — candidate structured tools/guardrails for read-only QA triage.
- https://github.com/anthropics/claude-agent-sdk-typescript — candidate repository/test failure review.
- https://github.com/googleapis/js-genai — candidate screenshot analysis/structured QA summaries.
- https://github.com/QwenLM/Qwen-Agent — candidate open-model tool-use/QA evaluation.
- https://github.com/modelcontextprotocol/typescript-sdk — standard bounded read-only test evidence interfaces; review the SDK version and security policy before integration.

No external AI model was invoked against MealDeck, no SDK or MCP server was added to the application runtime, and no model output is used as a release gate. The browser worker is deterministic and can produce redacted, aggregate evidence for an authorised human or later bounded model review. Before model integration compare the same synthetic cases across providers, require evidence-linked suggestions, cap time/cost, allowlist read-only tools, never pass secret codes or customer/payment data, and require reviewed tests and PRs rather than automatic AI writes. Existing agent guardrails continue to deny payment, finance, SQL, unrestricted MCP and KDS mutation. No model calls belong in voucher redemption or the prize draw.

## Remaining gates
Real iOS and Android/PWA accessibility, keyboard/screen reader, staff/KDS/printer and delivery tests are separate. The Munchbox banner requires verified canonical product IDs, approved terms and the independent draw evidence. The staff voucher release requires verified payment/database security and the correct independent project. Browser emulation is not a real device or a production commissioning result.

## Additional safeguards
The privacy panel has equal visual prominence for accepting/rejecting optional cookies, minimum 44px controls, scrollable short-screen layout and visible focus. Browser acceptance exercises customisation with both optional categories initially off, rejection and persisted consent. The provider-neutral agent policy now expressly denies staff voucher issuance/redemption/revocation, promotion activation, prize selection/export/contact and secret access, and rejects malformed model tool arguments (including inherited properties and accessors). The policy remains non-executing; ordinary authenticated checkout and manager permissions are separate.
