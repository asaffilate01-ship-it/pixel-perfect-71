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


## MealDeck Phases 19–21 safety and design contract

- Treat source module group allocations as **illustrative plans**. The only live settlement authority is Dishbee's immutable server-priced order/share ledger plus verified Adyen event receipt.
- Keep multi-brand delivery fee once per master order. Allocations must have no lost/duplicated pennies or unassigned quantity.
- Use src/lib/mealdeck-agent-guardrails.ts as a **server-side admission policy only**: never convert a model-provided boolean, role, tenant, order ID or permission to trusted identity. Do not enable arbitrary MCP/SQL, provider webhooks, KDS releases, payments or courier bookings from an LLM.
- Human review is mandatory for allergens, disputed payments, delivery exceptions and refunds. AI outputs and traces must redact personal information and secrets.
- Protect St Albans MealDeck delivery-only policy independently from Café1 counter/EPOS fulfilments. Coming Soon remains true until approvals.
- Apply Taste, Impeccable and Awesome DESIGN.md as design heuristics; do not import competitor code or AGPL sources into this proprietary repository.
