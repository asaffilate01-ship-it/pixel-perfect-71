# iPhone zoom rendering correction — 7 November 2026

## Report and source finding

A customer reported the homepage failing while zooming on an iPhone. Their
screenshot reads “A problem repeatedly occurred” for `https://mealdeck.co.uk/`.
It does not establish a specific device-memory limit, JavaScript exception or
server outage.

The live homepage was observed with 53 `.md-deck-card` elements and 212 image
elements after its intro. Source inspection showed each card retained an
infinite 159-second animation and persistent `will-change: opacity, transform`,
including the invisible cards. This is unnecessary rendering work and a
plausible contributor to an iPhone zoom failure, not a confirmed crash trace.

## Bounded rendering

- Keep the four-suit, 52-card sequence as data. During cycling, mount one card
  face plus the two existing decorative backs. Warm at most one next logo;
  retain the current face if that image is slow or fails to load.
- Retain the brief all-brand gathering intro on visible desktop screens only.
  Phones, coarse pointers, zoomed pages and reduced-motion users start with
  one card. The server-rendered and initial hydrated output are identical.
- Stop the card timer and remove its animation/perspective when the stage is
  out of view, the document is hidden, zoom is active or motion is paused.
  Resume without catch-up iterations. Remove listeners and timers on unmount.
- Use a short opacity reveal on small/coarse-pointer screens; retain the
  single-card turn on desktop. Never reserve layers for hidden future cards.
- Provide Pause cards / Resume cards, and respect reduced-motion preferences.
- Remove backdrop blur from the opaque marketing header and use an opaque
  mobile navigation surface.

The approved brand artwork, registered marks, menu state and payment authority
are unchanged. The viewport continues to allow native zoom. Do not add
`user-scalable=no`, restrict `maximum-scale`, or cancel the browser's gestures.

## Acceptance boundary

Automated lifecycle checks and desktop browser layout/zoom checks can establish
bounded rendering and the intended pause behaviour. They cannot reproduce a
physical iPhone's WebKit memory budget. Final device acceptance requires the
reporting iPhone to reload the deployed page, repeatedly pinch in and out,
scroll while zoomed, and open the menu/card details. Record the device, browser
and iOS versions if the original failure recurs.

Primary investigation references:

- https://bugs.webkit.org/show_bug.cgi?id=256876
- https://webkit.org/web-inspector/layers-tab/

These sources support investigating compositing cost; they do not diagnose
the reported MealDeck crash.
