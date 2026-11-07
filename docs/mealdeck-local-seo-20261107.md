# MealDeck Luton menu SEO — 7 November 2026

## Scope and implementation

The five current menus now have their own canonical public pages within the existing TanStack Start menu experience. Each page has a distinct title, description, main heading, useful category introduction, visible FAQs, a `Menu` node and a `BreadcrumbList`. Homepage and Luton discovery links, menu brand links and the public sitemap point to these pages. The parent menu route retains the shared basket when switching brands.

Initial server HTML reads the current public catalogue through the existing anonymous, read-only menu endpoint with a two-second bound. This makes the current menu, including updated Load’d dish names, available in the document that a crawler receives. Initial data does not enable selections before the browser's fresh menu check. The offline menu allowlist and its regression coverage include the new routes.

Legacy `/menus?brand=…` links keep their corresponding clean canonical. A conflicting query cannot replace the brand selected by a clean path; the route uses the matched child parameter, including a differently cased static `/Menus/` prefix. Empty brand query values use the generic indexable `/menus` page. Unknown clean brand paths return HTTP 404. Canonical and social URLs exclude query strings and fragments. Private pages and duplicate menu aliases stay out of the sitemap.

The existing Restaurant identity keeps the confirmed Luton address and dated opening hours, adds the five menu URLs and appropriate cuisines, and uses `Meal Deck` / `Meal Deck Luton` as brand aliases. Organization social links use the owner's `@mealdeckofficial` handle. No review rating, unconfirmed recurring hours or delivery availability is invented.

## Keyword and page map

These are intent and menu matches, not measured search volumes or ranking predictions. Terms belong in natural, useful text and appropriate metadata; they are not repeated as keyword lists.

| Page                      | Main searches and brand variations                                                 | Supporting menu topics                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/` and `/luton`          | MealDeck Luton, Meal Deck, Meal Deck Luton, food in Luton                          | One basket across five menus; collection and kerbside pickup from Selbourne Road           |
| `/menus/skorch-burgers`   | Smash burgers Luton, burgers Luton, Skorch burgers, Skorch Luton                   | Beef smash burgers, single/double/triple/four-patty burgers, sides and kids' meals         |
| `/menus/tavo-chicken`     | Chicken Luton, wings Luton, chicken wings Luton, Tavo chicken                      | Fried and grilled wings, fried tenders, buttermilk fried and spicy grilled chicken burgers |
| `/menus/loadd`            | Loaded fries Luton, Load’d Luton, Loadd, loaded chips, mac and cheese Luton        | Loaded fries, loaded mac and cheese, Full House boxes and the toppings actually listed     |
| `/menus/souvano`          | Souvano Luton, Greek food Luton, Turkish food Luton, doner Luton, lamb chops Luton | Stir-Fry Doner, Heatwave chicken, lamb chops and the current fries/rice/naan choices       |
| `/menus/moktl`            | Moktl Luton, Moktl mocktail lounge, mocktails Luton, mocktail drinks Luton         | Zero-alcohol drinks, Virgin Mojito and the current fruit-flavoured mocktail range          |
| Existing dessert sections | Milk cake Luton, Biscoff milk cake, Oreo milk cake                                 | Current named dessert products and their actual menu availability                          |

**Greek wraps / Turkish wraps:** the Souvano FAQ addresses these requested searches factually. The current menu lists doner, Heatwave chicken and lamb chops with fries, rice or naan; it does not list a separate Greek or Turkish wrap. The copy must not create an unavailable product or imply it can be ordered.

**Wingstop Luton:** Tavo's FAQ clearly states that Tavo Chicken is a MealDeck brand and is not affiliated with Wingstop. MealDeck's own wings menu provides the relevant category content. Wingstop is not used as MealDeck's business name, alias or homepage title, and this change makes no competitor price or quality claims.

Current ordering is **Luton collection and kerbside only**. Bedford and St Albans remain coming soon. Search copy must continue to follow the real catalogue and fulfilment availability as these change.

## Repositories, MCPs and tool choices

Reviewed primary repository documentation:

| Project                                                                     | Relevant use                                                                                                    | Decision for this change                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [google/schema-dts](https://github.com/google/schema-dts)                   | TypeScript vocabulary types for JSON-LD; the README identifies it as not an officially supported Google product | Consider as a development aid if schema coverage grows. Existing typed helpers and targeted tests cover this release without another dependency.                                                                                 |
| [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) | Repeatable performance, accessibility and technical SEO checks                                                  | Useful for a future browser audit budget. A Lighthouse score does not establish rankings or keyword demand.                                                                                                                      |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)     | Microsoft's browser automation MCP                                                                              | Existing browser/testing capabilities can verify navigation and rendered pages. No additional browser MCP installation is needed to implement these routes.                                                                      |
| [AminForou/mcp-gsc](https://github.com/AminForou/mcp-gsc)                   | Community Search Console query/page analytics and inspection tools                                              | An optional future integration, not a Google-official tool or an audited dependency in this release. It requires authorised property access; use read-only access for measurement and review its sitemap write tools separately. |

The implementation reuses server rendering, the existing public menu API, shared SEO helpers, repository tests and the dependency-free HTML audit below. No new SEO plugin or MCP is installed. Search Console performance data and keyword-volume tools are not connected for this work, so no clicks, impressions, search volumes or achieved rankings are claimed.

## Repeatable public-response audit

Start the application or a production preview, then run:

```sh
npm run verify:seo -- http://127.0.0.1:5173
npm run verify:seo -- https://mealdeck.co.uk
npm run verify:seo -- https://mealdeck.co.uk --json
```

The script defaults to `http://127.0.0.1:5173` when no base URL is supplied. It uses Node.js 20 or newer, no extra packages, 16 fixed anonymous GET requests, at most three concurrent requests, a 15-second request timeout and an 8 MiB response limit. It does not follow redirects, submit forms, place orders, authenticate or call customer APIs.

It checks all five clean menu pages and five legacy brand links for HTTP 200, correct unique category titles/headings, a single production canonical, matching `og:url`, indexable metadata, valid JSON-LD with one menu and breadcrumb list, and named crawlable links to all five brand pages. It also checks the public sitemap, the true unknown-brand 404, static-prefix case handling, the empty brand query and two query-conflict cases. Synthetic private markers must stay out of SEO metadata, JSON-LD, headings and anchor URLs; this is not a general application security audit.

Exit `0` means the tested responses passed; `1` means a response or SEO assertion failed; `2` means an invalid invocation/runtime. A live run before publication should report the old deployment's differences. The script deliberately does not infer publication from a commit or merge. Record local test, CI, merge and live audit outcomes separately when observed.

## Google guidance and measurement

The implementation follows Google's guidance on [descriptive title links](https://developers.google.com/search/docs/appearance/title-link), [crawlable anchor links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable), [JavaScript-generated content](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business) and [structured-data quality](https://developers.google.com/search/docs/appearance/structured-data/sd-policies). Google's [supported meta tags documentation](https://developers.google.com/search/docs/crawling-indexing/special-tags) explains that `meta keywords` has no effect on Google indexing or ranking; this work therefore improves actual page content and discovery.

After publication, use an authorised Search Console property to inspect the clean URLs and submitted sitemap, then compare query/page impressions, clicks, CTR and average position over consistent periods. Split branded MealDeck/brand queries from food-category queries to understand the change. Technical validation confirms page output; it does not guarantee indexing, rich results, ranking movement or sales.
