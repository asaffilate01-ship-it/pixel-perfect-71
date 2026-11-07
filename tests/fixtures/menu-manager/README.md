# Brand menus layout fixture

This mounts the actual `OpsMenuPanel` with eight synthetic products across five
named brands plus an unassigned product. It covers short/long product names,
shown/hidden/inactive items and a kitchen price override. No production component
was refactored for the fixture.

The HTML entry blocks application fetch/XHR requests **before** importing the
components. Names, identifiers, descriptions and prices are test data. There is
no authentication, live menu feed or successful save path. Category/add-on reads
and saves can therefore show the production unavailable/sign-in errors; that is
expected in this fixture and is not a statement about the live backend. Native
filtering, product selection, draft editing, unsaved-change prompts and permission
presentation are real component behavior. The fixture logs UI clicks, its notice
and reload callbacks, and blocked request origins/paths without query strings.

## Approved local preview

Copy these temporary entry pages to `public/` only when preparing a permitted
development preview:

```sh
cp tests/fixtures/menu-manager/__menu-manager-qa.html public/__menu-manager-qa.html
cp tests/fixtures/menu-manager/__menu-viewport.html public/__menu-viewport.html
```

Use the same supported preview process as the KDS fixture. In a managed workspace,
start `sites-preview` for this checkout and use its exact returned URL with the
approved browser tool. Open `/__menu-viewport.html`; the width presets resize one
iframe without discarding the current React state. The direct fixture is
`/__menu-manager-qa.html`.

## Visual checks

- At 320, 390, 768 and desktop widths, check that every product card has matching
  left/right edges, names wrap, and the document has no horizontal overflow.
- On phones, check that the selection controls line up beside the card contents
  and Edit/View/stock actions sit below the content with reachable touch targets.
- Check Shown/Hidden/Inactive and each brand filter. Short results must retain
  card widths and the full names of longer products.
- Select **Edit Double Deal · synthetic sample from Skorch Burgers · QA**. Enter
  a draft product name, resize the same iframe, and check that it is retained.
  Selecting another product should show the existing keep/discard prompt.
- Use **Fixture permissions** for manager, kitchen availability only and read-only
  views. Removing checkboxes must not leave a blank text column; read-only cards
  keep View and show no stock-change action.
- Use **Measure cards** for rendered left/right spreads, document width, row
  overlap and minimum action height. The output is an observation helper, not
  proof that a physical phone or real backend was tested.
- A failed browser access/approval check is a verification limit. Do not switch
  to an alternative browser-control path to bypass it.

Remove the two temporary copies from `public/` before any production build. Keep
the reproducible sources here; never ship the fixture as a public production route.
