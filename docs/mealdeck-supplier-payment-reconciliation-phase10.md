# Phase 10 — Supplier payment reconciliation (development only)

This phase introduces a **pure, read-only matching engine** in `src/lib/mealdeck-ops-payment-reconciliation.ts`. It is not a connected bank feed, a payment service, a remittance system or a posted accounting ledger.

## Input and controls
- Use approved supplier invoices only; reconcile their **gross outstanding** after approved credits and recorded payments.
- Import debits only from a verified banking feed or a finance-admin-reviewed bank statement; capture transaction ID, date, direction, reversal state, payee/supplier identity and reference.
- Never auto-match records where supplier identity is missing, amount differs, invoice/transaction IDs are duplicated, or more than one invoice/payment could be assigned.
- A unique exact-reference match has high suggested confidence; a unique amount-only match still requires manual review.
- Do not automatically mark an invoice paid, write a posting or trigger supplier disbursement based on a suggestion.

## Before activation
1. Apply approved phase 8 procurement and phase 9 invoice database migrations, deploy RPCs and verify RBAC with separate tenant and location accounts.
2. Add server-side bank-import storage with unique provider/transaction IDs, tenant and location scope, immutable source payload hashes, audit logging and explicit currency (GBP); **never** use client-input supplier IDs as verified banking identity.
3. Build finance-only review UI, explicit match/partial-payment/reversal/credit-note resolution, two-person approval for high-value exceptions, and secure receipt/document evidence handling.
4. Map to the accounting provider's posting semantics. A supplier payment and a recoverable VAT claim are separate independent assertions.
5. Test cross-tenant isolation, repeated imports, duplicate payments, negative/reversed entries, bank statement balance reconciliation and export controls in staging.
6. Only then wire the pure helper into an authenticated server workflow, without widening kitchen staff financial permissions.

Run unit tests with `bun test tests/mealdeck-ops-payment-reconciliation.test.ts`. Review and deploy the earlier stacked branches separately. No live reconciliation, bank transfer or production activation is implemented by this PR.
