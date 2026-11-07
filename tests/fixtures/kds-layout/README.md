# KDS layout fixture

This is a synthetic UI fixture for the existing KDS display components. It has
eight active sample orders, including 15-line and eight-line tickets, plus three
completed orders. Names, contact numbers, prices, and instructions are test data.
All controls update local React state or write their received arguments to the
visible callback log. The HTML entry blocks application `fetch` and XHR requests
before loading the components. It does not mount the authenticated kitchen feed.

The fixture stays under `tests/fixtures/` and is not a production route. No new
dependencies are required. Browser verification must use an approved preview
environment; source/type checks alone do not establish visual acceptance.

## Temporary preview setup

From the repository root, after browser access to the preview is approved:

```sh
cp tests/fixtures/kds-layout/__kds-layout-qa.html public/__kds-layout-qa.html
cp tests/fixtures/kds-layout/__kds-viewport.html public/__kds-viewport.html
```

In a managed workspace, run `sites-preview start` with the absolute checkout
path and open its exact returned URL using the supported browser tool. If a
different preview is active, stop it before starting this checkout. In an
ordinary local checkout, use `npm run dev`.

Open `/__kds-viewport.html` on that development server. The width/height
inputs and 320/390/768/1280/1600 preset buttons resize the same iframe without
reloading its React state. Large frames scale visually to fit; their inner CSS
viewport retains the selected dimensions. `/__kds-layout-qa.html` opens the
fixture directly. These entry pages require the Vite development server.

## Required checks

- Check mixed ticket heights in Tickets, all stage lanes, the Preparing lane,
  and Done at mobile, tablet, and desktop widths. Check long names, multiline
  notes, add-ons, included meal components, attached extras, named bags, and
  pickup/kerbside details for wrapping, spacing, and complete visibility.
- Enter `24` in **Collection code for order 9102**. Resize repeatedly and select
  **Remove earliest**, which removes order 9101. Confirm `24` remains and the
  remaining cards retain their identity. The complete synthetic code is `2468`.
- Exercise Add order, each-item readiness, Accept, Start preparing, packing
  confirmation, cancellation, and handover. Inspect the local callback log.
  Done cards must remain read-only. Reset intentionally clears fixture state.
- Use **Jump to order**, keyboard navigation, browser text enlargement, and the
  standalone mobile-navigation switch. Check horizontal stage scrolling, focus
  visibility, reachability of every control, and absence of page overflow.
- Toggle **Legacy rows comparison** with unchanged data, then use **Measure
  layout** to compare card geometry against the packed layout. The visible
  geometry report is generated from the rendered DOM.
- Check browser errors and network activity in the approved environment.
  Application requests should not occur. The HTML records blocked attempts in
  `window.__KDS_QA_BLOCKED_REQUESTS__` and `html[data-blocked-requests]`.
- Open **Tools** to check the production sound/vibration controls. This fixture
  uses the real alert hook with a synthetic scope and its local order IDs. Initial
  loading must not alert; **Add order** produces one fresh synthetic arrival.
  A sound/vibration test can use this device's real speaker/vibration API but can
  never accept, pay, print, or update a real order. Preferences apply only to the
  preview origin. Verify enabled/disabled and unavailable wording, and that
  vibration does not require sound to be on.
- Physical vibration needs a supported phone, an initial interaction, and a
  visible KDS page. Use the direct fixture page for that check. Desktop API
  success is not evidence that a phone vibrated; iPhone Safari lacks this API.
- Public fixture HTML is static and may not hot-reload. After source changes,
  reload through the approved browser tool. A security rejection is a blocker;
  do not switch to another browser-control route to bypass it.

## Remove temporary public pages before production build

From the repository root:

```sh
rm public/__kds-layout-qa.html public/__kds-viewport.html
npm run build
```

Keep the reproducible fixture files in this test folder. Never commit the two
temporary copies under `public/` or include them in a production build.
