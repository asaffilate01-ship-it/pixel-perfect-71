# Published menu route recovery — 4 November 2026

## Diagnosis

The live `https://mealdeck.co.uk/menus` returned the app's own server-rendered
404. Fresh HTML at `/`, `/menus` and `/order` identified source commit
`db12d855d06ff36206845bd476e7fd55f70aa5bc`, the head of
`feature/dishbee-play-food-cards`. The launch menus and approved logos were
already merged into `main` at `123f1b22f5efb83987980eafdb5078253cd240f6`.

The published branch and main had diverged. Publishing the former therefore
could not include the newer `/menus` route. This was not a missing SPA fallback:
the app uses TanStack Start server rendering, and the current production worker
served `/menus` successfully. A local build using Lovable's platform mode also
included `/menus` in `dist/.lovable/routes.json`.

## Repair

Reconcile both histories with a normal two-parent merge, then update the
published source branch without force or history replacement. Keep the five
approved launch menus, all latest ordering safeguards, and the approved logo
registry from main. Preserve the published branch's Bedford page, franchise
logo presentation, archived earlier order screen, project north star and
build-config version. Retain coming-soon ordering and St Albans delivery-only
scope, independently of Café1's direct services.

## Release verification

The final deployed HTML must identify the reconciled source commit rather than
`db12d855`. Check direct navigation and refresh at `/menus` and `/order`, all
five brand selections, and a genuine unknown path (which must remain a 404).
Check that the preserved Bedford page renders without the St Albans address.

Lovable syncs only its selected GitHub branch. The published SHA proves which
source was deployed; it does not directly reveal the current editor setting.
The connected Lovable account cannot access this MealDeck project, so the
project owner must verify the selected branch and publish the synced version
if the hosting snapshot remains unchanged. For future work, use `main` as the
Lovable sync branch once both histories have been reconciled.

Reference: <https://docs.lovable.dev/integrations/github>.
