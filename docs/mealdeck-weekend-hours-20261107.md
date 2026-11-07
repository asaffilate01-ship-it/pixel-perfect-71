# Luton weekend opening-time correction — 7 November 2026

The owner changed Saturday 7 and Sunday 8 November opening to **3pm UK time**.
Friday remains **3pm–midnight**, Saturday is **3pm–midnight**, and Sunday is
**3pm–11pm**. The shared public schedule supplies the promotional banners,
menus, footer, offers, Luton details and SEO.

## Independent backend update

`deploy/mealdeck/post-install-migrations/20261107105708_mealdeck_weekend_3pm_opening.sql`
changes only `mealdeck_private.launch_window_at(timestamptz)`. The migration
accepts the reviewed original installation, the reviewed live midnight
extension, or its own exact resulting definition. Unknown definitions, an
unrelated backend profile or exposed helper permissions stop the transaction.

The existing clock/test-identity wrapper, function owner and permissions remain
intact. The saved kitchen state remains unchanged; a manually Closed kitchen
still requires its existing authorised Online action. No payment, order,
receipt, menu price, consent, promotion end date or recurring scheduler changes.

Use `buildWeekendOpeningHoursSql()` for the complete atomic migration, or the
managed builder only when one migration runner owns the outer transaction.
Historical migrations are not rewritten. A later editable weekly-schedule
release must use these newly approved opening times when it seeds its defaults.

## Verification and release

Source validation passed: **8 real-SQL checks**, including 16 boundary inputs,
plus scoped ESLint, Prettier and whitespace checks. The public schedule, offers,
location and SEO suite passed all **23 tests**; TypeScript and the production
build also passed.

`node tests/postgres/weekend-opening-hours-behavior.mjs` runs the actual SQL in a
disposable PGlite database; `--native` uses the existing localhost-only test
harness. Checks cover both accepted baselines, safe reruns, exact opening and
closing boundaries, rejection of unknown definitions, and preservation of the
wrapper, private permissions and Closed settings.

Production installation and website publication are separate release steps.

### Production database application — 11:03 UTC, 7 November 2026

The exact tested migration (SHA-256
`e996f2e590474c48b1c06d3fa60171cb462dc2eda732db9abeae946596b9718e`)
was applied atomically to the verified independent MealDeck database. Readback
at `2026-11-07T11:03:40.50427Z` passed all **16 boundary checks**, including both
weekend days closed at 13:00 and 14:59:59.999 and eligible from 15:00. The existing
midnight Saturday close, Sunday 23:00 close and post-weekend behaviour passed.

The resulting helper body hash is `979f623039044e22178c0192bd045aa9`.
The wrapper definition hash remained `d1638c3999d3b1bf42c95d0176228d67`, all
API roles still lack direct helper execution, and the complete saved kitchen
settings (including Closed, checkout disabled and the 30-minute estimate)
matched the pre-change readback exactly. No recurring schedule is installed.

After source publication, verify the canonical website's banners, footer,
offer terms and Luton hours independently of this database result.
