# MealDeck arcade: responsive QA and AI-agent evaluation

Updated: 2026-11-27

## This release

Kitchen Chaos now has three deterministic opponent strategies, legal move advice, playable-card filtering, actual draw counts and a 120-player-move termination rule. Brand Snap supports 6, 12 and 24 pairs with guarded answer/advance transitions, current and best streaks, accuracy and missed-answer review. Arcade help now contains 34 reviewed questions, natural-question search, topic filters and an in-game jump link. These are entertainment-only features; no payments, rewards, customer data, or new model runtime calls are involved.

## Automated acceptance

Run the existing Verify MealDeck workflow, including its game regression, lint, TypeScript, build and existing checkout/database regression stages. New tests exercise 120 seeded card-game rounds across all difficulty policies, card conservation, legal moves, round termination, balanced quizzes, duplicate answer events and help-search relevance. A green CI run is required before merge. Unit tests do not certify a device/browser layout.

## Manual and browser QA matrix (pending execution)

| Viewport | Exercise | Acceptance |
| --- | --- | --- |
| 320x568, 375x667, 390x844 | Kitchen Chaos hand filter, advice, draw and wild choice | No horizontal overflow; legible card labels; every action remains reachable; filter never hides draw |
| 768x1024 and 1024x768 | Card tables and quiz modes | No cropped text or controls; three modes remain understandable; stats wrap naturally |
| 1280x800 and 1440x900 | Game library, active game, keyboard navigation | Visible focus, semantic buttons and labels, consistent spacing and restrained animation |
| All | Snap quick/classic/marathon | One answer per pair; result matches answers; missed-pair review; no timer |
| All | Help link, topic filters, search and focus mode | Current game is not reset by help; same-game help cannot accidentally navigate; result count is truthful |
| All | Reduced motion, 200% zoom, keyboard and screen reader | No information conveyed by colour alone; no inaccessible controls; correct accessible labels and live result announcements |

Use a disposable preview or local test origin; avoid submitting orders, charging cards, accessing customer data or altering production settings in browser QA. Capture screenshots and a report of failures. Automated accessibility checks complement, not replace, keyboard and screen-reader inspection.

## Public repositories and tools reviewed

- [Playwright](https://github.com/microsoft/playwright): device profiles, isolated browser contexts, semantic locators and screenshot regression tests. Proposed for dedicated arcade browser tests.
- [axe-core](https://github.com/dequelabs/axe-core): automated accessibility checks. Proposed for a browser QA gate, plus manual accessibility review.
- [OpenAI Agents SDK for TypeScript](https://github.com/openai/openai-agents-js): candidate orchestration layer for bounded QA and content-review agents.
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview): candidate for developer-side repository review and test-failure analysis.
- [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs): candidate for multimodal screenshot review and structured content drafts.
- [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent): candidate for separately evaluated open-model tool-use workflows.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): candidate for a standard read-only tool interface for repository/test evidence.

These references are evaluation inputs, not installed dependencies or claims that those providers ran against MealDeck. No external provider SDK or credentials are added in this release.

## Proposed agentic QA architecture

1. A coordinator receives a commit SHA and a bounded, synthetic QA task.
2. A browser worker records viewport screenshots, keyboard interactions and accessibility findings.
3. A review worker may use an approved provider to analyse redacted evidence and propose a reproducible test or patch.
4. Deterministic regression tests and a human-reviewed PR remain the release authority. Model output is not a test pass or deployment authorisation.

Tools should be allowlisted and read-only by default. Do not expose Stripe, customer orders, Supabase service-role credentials or production write access to model agents. Never log sensitive inputs in model prompts. Set explicit cost/time limits and compare providers on the same synthetic benchmark before choosing one.

For game engines, prefer deterministic local rules and bounded search over generative calls: lower latency, predictable legal moves, reproducible tests and no per-move API cost. Any future generative question bank should be reviewed, versioned and clearly fictional where appropriate.
