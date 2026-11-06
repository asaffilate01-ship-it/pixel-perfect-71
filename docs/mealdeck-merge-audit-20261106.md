# MealDeck source consolidation — 6 November 2026

## Scope and evidence

The owner requested that all applicable completed work be pushed, committed and merged into `main`, preserving published Git/Lovable history.

At the start of this review, main was `43f4ef4773b8ff0d1af232a734a4bd980067d8dc` (group-room PR #77) and there were no open pull requests. A full-history, read-only Git audit inspected all **81 non-main branches**. Sixty-eight were already ancestors of main; thirteen had commits outside its ancestry. A second audit classified patch equivalence and attempted in-memory merge trees, without updating any refs.

Evidence:

- [Full branch inventory and ancestry audit](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42188461801), 08:33 UTC.
- [Patch-equivalence and merge-conflict audit](https://github.com/asaffilate01-ship-it/pixel-perfect-71/actions/runs/42188791695), 08:35 UTC.
- [PR #78: generated database type synchronization](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/78).

These counts describe the pre-consolidation snapshot, not a perpetual assertion about new branches.

## Applicable changes

`feature/dishbee-play-food-cards` at `26057f69c34cd58bf76b6abb67e6168f5513741c` contains one additive application-source change: 254 lines of generated RPC type declarations in `src/integrations/supabase/types.ts`. They cover the existing ordering-room, shared-payment and Terminal routines. PR #78 brings this into main under the normal release verification workflow. This is a type synchronization, not new payment or notification activation.

`feature/mealdeck-launch-access-20261106` initially contained only a temporary source/dependency-review workflow. Its name and commit messages do **not** establish an implemented launch-access feature or a committed SQL migration. The temporary workflow has now been removed from the final tree, with this audit retained as the durable record. Its earlier commits remain in history; no rebase, force-push or history rewrite is required.

## Branches deliberately not reapplied

| Branch | Audit finding | Disposition |
| --- | --- | --- |
| `codex/mealdeck-checkout-readiness` | Six unique historical patches; conflicts in checkout, discovery, dependencies and verification. | Retain separately. The current independent backend and reviewed menu/checkout paths take precedence; any useful residual feature requires a focused port and tests. |
| `codex/mealdeck-homepage-promos-20261001` | Two historical homepage/promotion patches conflict with the current homepage. | Retain as an old design, not a replacement for the approved current homepage and dated November offers. |
| `feat/mealdeck-live-ordering-flow` | Nine historical Dishbee-backed ordering patches conflict in every changed application/configuration area. | Do not restore the superseded shared-backend routing model. |
| `feat/mealdeck-production-flow-v2` | Six unique patches and one patch-equivalent commit; conflicts in routing, homepage and environment examples. | Superseded by the current Luton-only independent ordering architecture. |
| `feature/mealdeck-category-first-ordering-20261013` | Seventeen historical patches; conflicts in ordering, navigation and St Albans availability. | Do not replace the current menus or reopen St Albans through old availability assumptions. |
| `feature/mealdeck-marketplace-order-experience` | Six historical patches conflict with current marketplace helpers, styles and tests. | Keep the current implementation; no blind replacement of evolved files. |
| `feature/mealdeck-premium-order-discovery` | Twenty-two historical patches conflict with current discovery, saved-basket helpers and ordering. | Preserve the current approved UI and current-price validation. Focused ports can be reviewed independently. |
| `fix/mealdeck-dishbee-tenant-launch-safety-20261015` | Nineteen unique historical patches and two equivalent commits; conflicts across routing/configuration. Includes old Dishbee/SumUp integration. | Superseded by the explicit independent MealDeck backend and Stripe launch direction. |
| `feature/mealdeck-ops-finance-recipes-rbac-20261102` | All three outstanding commits are patch-equivalent to changes already in main. | No missing source fix to reapply. A wholesale merge still conflicts with later evolved files. |
| `feature/mealdeck-procurement-batches-phase8-20261102` | All three outstanding commits are patch-equivalent to changes already in main. | No missing source fix to reapply. Preserve the later main versions. |
| `flyer-a3-draft` | Three commits add a print-flyer generator and workflow; clean merge is mechanically possible. | Keep the draft separate from this application release; no current-artwork/content acceptance is claimed. |

An unmatched historical patch ID is not proof that its functionality is missing from the rewritten current application. Conversely, this audit does not claim to have ported every old idea. The legacy branches remain available and have not been deleted or falsely marked as merged.

## Activation boundary

Repository consolidation is distinct from hosted database state and live provider configuration. Database-only business, kitchen, catalogue, staff or test-access changes do not become versioned source merely because a Git branch is merged.

This consolidation does not install secrets, verify email addresses, set passwords, create payment-provider webhooks, enable Resend/Web Push, change opening hours, accept a real payment, release a kitchen ticket or certify physical printer/phone behavior. Record those acceptance results separately. The requested 08:00–14:59:59 test-only window and 15:00 public opening must not be presented as end-to-end working solely from this merge.

Use normal merge commits with the expected PR head SHA, and verify the resulting main branch. Keep the existing hosting branch aligned by fast-forward only after all applicable source has been reconciled. Do not discard independent hosting changes.
