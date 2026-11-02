<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the commercial homepage brand collection independent from location-filtered ordering menus, because marketing and operational availability can differ.

- SEO head tags come from the shared `seo()` helper with mealdeck.co.uk as the canonical base — keeps canonical/og consistent per page.
- Blog posts live in a static list and render as playing-card tiles — no backend needed for content yet.
- Global light/dark appearance is controlled by the shared theme provider and semantic CSS tokens — keeps every route and overlay synchronized.
- The homepage card showcase uses a brief all-brand fan-to-deck intro before its repeating brand reveal — keeps food primary while retaining the playing-card identity.
- Hero card ranks and suit counts come from a separate browser-safe deck definition, leaving restaurant availability untouched; corner emblems are extracted from the approved card artwork.
- Hero and offer cards import the same food-suit artwork map so their corner emblems stay consistent.
- Play uses a separate realistic food artwork map so game imagery can improve without changing approved logo and marketing card emblems.
- Ordering uses a browse-first, restaurant-led marketplace layout while serviceability is confirmed separately — keeps discovery fast without weakening location rules.


- Review `PRODUCT.md` and `DESIGN.md` before MealDeck feature/UI changes. Preserve the card/food identity, existing approved artwork, app vs marketing contrast tokens, and clearly marked sample/illustrative menus.
- Develop via the GitHub codebase and tests; do not invoke Lovable as a build environment. Leave all existing Git/Lovable history untouched.
- MealDeck must never assume that a WhatsApp chat, agent response, browser redirect or illustrative price is a paid order. Only Dishbee's verified server-side payment/order authority can release KDS.
- Per-location official WhatsApp business numbers are server-configured, verified and disabled by default. No private account/customer data, checkout state or prices in chat-link query strings. Omniqora keeps channel identity; Cafe 1's independent EPOS and restricted menus stay separate.
