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
- Ordering uses a browse-first, restaurant-led marketplace layout while serviceability is confirmed separately — keeps discovery fast without weakening location rules.
