# Souvano KDS: ordered main vs shared included side

**Owner report:** 8 November 2026. The Souvano ticket displayed “Doner / Lamb Chops”, leaving kitchen staff unsure which main to prepare.

## Verified source of ambiguous wording

The launch catalogue has **three separate priced main products**:

| Frozen SKU | Kitchen main | Included choice |
| --- | --- | --- |
| `souvano-stir-fry-donner-stir-fry-donner` | Stir-Fry Doner | Plain / Fiery Sweet Chilli / Dynamite / Korean BBQ; then Fries / Rice / Naan |
| `souvano-heatwave-heatwave` | Heatwave | Fries / Rice / Naan |
| `souvano-lamb-chops-lamb-chops` | Lamb Chops | Fries / Rice / Naan |

The two **different** Doner and Lamb Chops products share the same `souvano-meal-side` modifier group. Its old *group label* was `Souvano · Included side (Doner / Lamb Chops)`. That is a description of where the side is offered, **not** the customer's selected main. The KDS had been displaying this label alongside the actual side choice.

## Change

- Active and completed KDS views prominently label the *frozen ordered main* as **MAIN DISH** with its own actual name. They do not choose a dish from its side group.
- The existing old group label is rendered as **Included side: Fries / Rice / Naan** (showing the actual selected option), without the two main names. Works for unaltered older tickets, even before the database metadata is corrected.
- A genuinely ambiguous **frozen item name** instead receives a **VERIFY MAIN** warning; never silently infer Lamb Chops or Doner from a flavour, price, side or other order line.
- The source importer and reviewed generated catalogue manifest use `Souvano · Included side` for future installations. Distinct Heatwave-side group ID/name is retained to keep group names unique.
- Prices, products, stable SKUs, modifier IDs, snapshot contents, receipt fingerprints, kitchen stages and completed order history are unchanged.

## Live existing group metadata (optional one-time owner operation)

`deploy/mealdeck/operations/20261108_souvano_clear_shared_side_label.sql` makes the **metadata name only** correction on the independent MealDeck database with strict checks of the installation marker, tenant, actual Souvano linked SKUs, group cardinality and available side names. It records an audit entry and is idempotent. The operation is **not run by the website deployment** and must not be executed against Dishbee or an unverified project. Keep historical order and receipt snapshots untouched. If a current admin has edited the group, review instead of forcing the operation.

## Acceptance

1. Run `bun test tests/mealdeck-kds-dish-clarity.test.ts` and the full KDS regressions, plus build and lint.
2. In a test or approved live kitchen, place a single *Stir-Fry Doner, Korean BBQ, Rice* and a separate *Lamb Chops, Naan*. The two tickets must read their exact mains, with the corresponding side and doner flavour; never a combined “Doner / Lamb Chops” main.
3. Confirm narrow mobile and desktop KDS visibility and the completed Done view.
4. Check an existing older ticket with the legacy shared-side label. It must show **Included side**, still preserving the actual selected side and original purchased main.
5. Deploy the new website code before expecting the visual correction. Source commits, CI, hosted publication and a physical KDS order check are different acceptance steps.
