# Approved MealDeck logo integration

The site uses the 16 approved transparent logo PNGs from the corrected logo set:
the MealDeck master and all 15 endorsed food/drink brands. The small, right-aligned
“by MealDeck” line is already part of each brand asset. The MealDeck master already
contains its registered mark, so the UI does not add another one.

## Asset fidelity

`src/assets/approved-logos/` contains full-resolution lossless WebP encodings.
Each file was decoded and compared against the approved PNG as RGBA bytes:
**all 16 match exactly**, including alpha and transparent padding. There was no
resizing, cropping, tracing, recolouring, generative editing, or added glow.

The files total **7,593,870 bytes**, down from **10,745,743 bytes** of PNGs
(29.3% smaller). `manifest.json` records each source filename, its SHA-256,
the decoded RGBA SHA-256, dimensions, byte counts and verification result.

## Shared use

- `src/lib/brand-logos.ts` is the shared asset registry. It supplies URLs and
  intrinsic dimensions without coupling marketing to kitchen availability.
- Marketing cards, the rotating deck, brand grids, franchise pages, ordering
  and game brand identities use that registry.
- `MealDeckLogo` renders the complete master in the header, footer, hero deck,
  mobile menu card, location cards and secondary MealDeck identity placements.
  Its `object-fit: contain` layout keeps every card edge visible. Distinct
  decorative card backs and food-suit artwork are retained.
- Paratique and Moktl use their approved originals, including every symbol,
  wordmark, descriptor and subtle endorsement.
- Ordering retains its `skorch-burgers` ID and uses the same Skorch logo as
  the marketing `skorch` ID. Café1 remains a separate, unchanged asset.

Keep logo images contained and place dark-lettered brands on a light paper
surface. Transparent artwork must be composited using its alpha channel;
do not flatten it against black or apply recolouring filters to compensate.

This asset change does not change menus, kitchen availability, launch gates,
checkout authority or payment behaviour.

The reduced-motion deck rules use the same specificity as the animated stage,
keeping the complete MealDeck title card visible when motion is reduced.

## Social preview

`public/og-image.png` is a byte-for-byte copy of the approved white-background
MealDeck master (1106 × 1116). Default SEO uses these actual dimensions and a
square Twitter summary card so the complete artwork is retained. Custom blog
and franchise images keep their large-image card treatment and do not inherit
the master's dimensions. The previous JPEG remains unused for cached links.

PNG SHA-256: `3a18ecc2afd2e651bf6d9919be9c56c283a5d511b10a270ba10a6e795eb06289`
