# Games growth and receipt QR — 7 November 2026

## Owner request and scope

The owner requested a games QR on the receipt, either under the logo or immediately
before the footer, and implementation of the five promotion ideas from the prior
sharing release. This change chooses **before the footer**: all purchased items,
packing instructions, notes and totals remain ahead of the invitation.

| Idea                      | Implemented result                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Daily challenge promotion | Permanent `/play/daily` entry, rotating among three supported daily puzzles; homepage entry and Copy daily link in the kit. |
| Short game clips          | Three downloadable 11-second vertical game previews: Snack Trail, Skewer Sort and Pantry Sweep.                             |
| Branded social cards      | Square 1200×1200, Story 1080×1920, and print 1240×1754 exports using approved artwork. Story and print include QR codes.    |
| Receipt and printed QR    | Stable `/play/receipt` QR in both receipt renderers, plus A4 poster and A6 table-card layouts in the kit.                   |
| Games to menus            | Menu links beside the playing area and on the receipt welcome page, with normal ordering eligibility unchanged.             |

The promotion kit is `/play/promote`. It prepares captions and files after an
explicit visitor action. It does not publish social posts, send WhatsApp messages,
broadcast offers, or claim prizes, discounts or loyalty rewards for playing.

## Receipt rendering

The fixed block says:

> Got a minute? Play MealDeck
>
> Scan for free food games
>
> [QR]
>
> mealdeck.co.uk/play

The encoded destination is exactly **`https://mealdeck.co.uk/play/receipt`**. It has
no order identifier, customer details, authentication capability or expiring date.

The browser uses an inline SVG from a trusted, generated module. This avoids
adding an image-load dependency to the existing print send lifecycle. The thermal
bridge uses a fixed 246×246-dot raster with six dots per module, Q error correction
and a complete four-module white quiet zone. It uses the existing `GS ( L` graphics
framing. The order cannot supply QR data, a URL or printer commands.

Canonical receipt validation, immutable snapshots, arithmetic, payload hashing,
one-copy journal semantics and final cut behavior are preserved. No database
migration, receipt regeneration or production print action is part of this work.

Reproduce the trusted module and PNG with:

```sh
node tools/receipt-bridge/build-games-qr.mjs --check
```

### Device rollout

Website publication updates the `/printer` preview and browser print path. The
separately installed Node/TCP bridge needs the updated renderer and generated QR
module deployed with its existing journal retained, followed by its established
restart/recovery procedure. Never clear that journal to apply this presentation
change or replay unresolved jobs automatically.

The H10S setup APK remains a separate offline diagnostic with a bundled setup
ticket; it does not consume either renderer or customer receipt jobs. This release
does not change that APK or activate a production Android receipt consumer.

Digital decoding and layout verification do not establish actual paper quality,
device graphics support or successful scanning from a physical printed receipt.

## Discovery and sharing

All 19 games have `/play/<gameId>` pages with unique server-rendered titles,
descriptions, canonical URLs and 1200×630 Open Graph PNGs. The public sitemap lists
the games, daily entry, receipt entry and promotion kit. Unknown game slugs return
404 with fixed copy; arbitrary path text is not reflected into metadata.

Existing `/play?game=...` links still work and identify the new game page as their
canonical. Supported daily dates, board sizes and Food Pairs skins are validated
against the existing public setup allowlist. An invitation preserves its selected
date and size. A completed result always uses the completion's frozen date/variant;
a fresh result cannot inherit an unrelated daily page's settings.

The daily route resolves its UTC date once and keeps the visit's puzzle stable
while it is played. The shared Playbook provider remains mounted while navigating
within `/play`, preserving session-only progress when device storage is unavailable.

The kit provides selectable captions/links when clipboard access is unavailable.
Image generation is abortable, stale results are discarded, and object URLs are
released on selection changes and unmount. Print controls remain disabled until
the prepared print image has loaded. Clips use explicit controls, no autoplay and
`preload="none"`.

## Using the promotion kit

1. Choose a game. For Sauce Switch, Menu Quest or Bento Sudoku, optionally select
   a daily date and supported board size.
2. Copy the caption and game link. Use the permanent daily link for a profile or
   recurring QR placement; use a dated link when inviting people to the same puzzle.
3. Select **Prepare downloads**, then save a square post, Story or QR print.
4. For printed material, choose the A4 poster or A6 card layout and scan the final
   physical output before displaying it. Use an evergreen game link for long-lived
   printed material unless a dated challenge is intentional.
5. For the three preview games, play the clip and download the MP4 for a manual
   social post. Include the copied clickable link, particularly in Stories viewed
   on the same phone as the QR image.

The reproducible media sources and font licenses are documented in
`tools/games-promotion/README.md`. Clips illustrate verified game-engine states and
are labelled Game preview; they are not presented as customer recordings.

## Measuring the release

Use the existing hosting analytics page breakdown to observe `/play/receipt`,
`/play/daily`, `/play/promote` and individual canonical game paths separately. This
gives coarse entry-page evidence without adding customer identities or new tracking
cookies. The receipt route is a useful source indicator, though its URL can also
be copied or opened during testing; its visits are not an exact count of paper scans.

Compare equivalent periods and record campaign dates externally. Hosting summaries
may return only the leading paths; a missing path must not be treated as zero.
Page/source counts may include staff and QA activity and do not identify a unique
customer cohort.

This release does **not** implement an attributed start → finish → share → referred
visit → menu → paid-order funnel. Menu visits and verified paid orders must not be
claimed as caused by a game from aggregate page counts. The paid-order ledger
remains the authority for sales, and local Playbook results remain entertainment
data rather than server-verified achievements.

## Validation completed before release

- 227 game, sharing, promotion, QR, receipt-browser and SEO tests passed, with
  58,600 assertions and zero failures.
- All 38 Node bridge tests passed, including loopback transport, canonical receipt
  matching, durable recovery, replay/copy handling and fixed QR raster placement.
- TypeScript and scoped ESLint passed; the production build passed.
- Direct requests to the compiled Cloudflare entry verified status 200 and unique
  server-rendered metadata for all 19 games and the three new entry pages, a real
  404 for an unknown slug, working legacy setup links and all game sitemap entries.
- Independent jsQR checks decode receipt SVG/raster artwork at both 384/576-dot
  paper widths and preview/print SVG scales to the exact stable receipt URL.
- Browser review confirmed the QR before the legal footer at both 58/80mm layouts,
  the receipt-to-daily flow, a 320px promotion page without horizontal overflow,
  and a contained 390×400 share dialog.
- Downloaded 6×6 Bento daily Story and poster PNGs were visually reviewed, measured
  at 1080×1920 and 1240×1754, and independently decoded to the same date/size URL.
- Each 720×1280 MP4 is 11 seconds, H.264/yuv420p at 24fps. Its compressed end frame
  was independently decoded to the correct game URL. Browser playback was verified.

Publication and physical printer acceptance are separate from these source and
preview checks. The pull request records the exact release commit and live readback.
