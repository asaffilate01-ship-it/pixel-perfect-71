# MealDeck game promotion assets

These assets support the public `/play/promote` kit and the canonical game-page
social previews. They do not publish posts or send messages.

## Rebuild

From the repository root, with the locked Bun dependencies, Python 3 + Pillow and
FFmpeg installed:

```sh
bun tools/games-promotion/create-manifest.ts
python tools/games-promotion/render.py
```

- `public/game-previews/<game>.png`: 19 Open Graph images, 1200 × 630.
- `public/game-promos/<game>.mp4`: Snack Trail, Skewer Sort and Pantry Sweep;
  11 seconds, 720 × 1280, H.264/yuv420p, 24 fps, silent, with fast-start playback.
- `public/game-promos/<game>.png`: matching cover frames.

The clips are labelled **Game preview**. They illustrate legal states from the
shipped rules, not customer recordings or fabricated player achievements. Snack
Trail runs a fixed legal route with deterministic food selection. Skewer Sort
replays a certified solution. Pantry Sweep chooses moves using visible number
clues only. The manifest generator fails if a sequence violates those checks.

Each clip ends with a QR to its canonical game page. The QR is generated locally
with pinned `qrcode` 1.5.4, uses Q correction and a four-module white quiet zone.
The release verification decodes frames extracted from the compressed MP4s with
the independent `jsqr` 1.4.0 decoder; verifying only the source matrix would miss
compression/rendering mistakes.

The ordinary game pages load only their static social metadata. Videos live in
the promotion kit with explicit playback controls and no autoplay.

## Artwork and fonts

All visible food suits and the complete MealDeck logo come from the approved
repository assets. No substitute logo, French taco art or generated brand asset
is introduced.

The included Outfit and DM Sans font files come from the official Google Fonts
repository, with their unmodified SIL Open Font License notices alongside:

- <https://github.com/google/fonts/tree/main/ofl/outfit>
- <https://github.com/google/fonts/tree/main/ofl/dmsans>

The font files are rendering inputs under `tools/`; they are not added to the
customer page bundle. The site continues to use its established font delivery.

Library sources reviewed for this feature:

- QR generator: <https://github.com/soldair/node-qrcode> (MIT).
- Independent test decoder: <https://github.com/cozmo/jsQR> (Apache 2.0).

Dynamic square, Story and print-ready PNGs are created in the browser by
`src/lib/mealdeck-arcade-share-card.ts` after an explicit request. They use the
same validated public links as the kit captions and QR codes.
