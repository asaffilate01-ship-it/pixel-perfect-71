# MealDeck owned marketplace bridge

This package supplies separate **Uber Eats browser** and **Just Eat Android/Sunmi** adapters, a deterministic worker, exact-reference order extraction, and durable command reconciliation. It uses MealDeck's own `/api/marketplace/bridge` endpoint and does not require UrbanPiper, Otter, HubRise, or an LLM for ordinary orders.

**Current status:** implementation and synthetic fixtures are provided; both live configurations are **disabled and unconfigured**. No production merchant selectors, connected marketplace accounts, device permissions, successful customer notifications, or working Sunmi installation are claimed. The provided fixture selectors describe only our local test interface. Changing `mode` alone cannot commission a connection.

The Just Eat component is a Node controller talking to a separately installed **local Appium/UiAutomator2 server** and an authorised Android device. It is **not a Sunmi APK**, printer integration, or device-management bypass. Uber uses a visible, dedicated Chrome merchant session.

## Run the local checks

Use Node 24 and install this package independently of the web app:

```bash
cd apps/mealdeck-marketplace-bridge
npm ci --ignore-scripts
npm run check -- --config config.uber-eats.example.json
npm run check -- --config config.just-eat.example.json
npm run demo
```

Both configuration checks should report `unconfigured`. The demo uses synthetic in-memory UI fixtures and a temporary journal, makes no network requests, and performs no merchant action. Its output explicitly marks every result as a fixture. It shows original references, complete lines, accepted/ready readback, and unsupported actions remaining unsupported.

The full test command includes a real Chromium DOM fixture and a loopback W3C/Appium server fixture:

```bash
npx playwright install --with-deps chromium
MEALDECK_REQUIRE_BROWSER_TESTS=1 npm test
```

`MEALDECK_TEST_CHROMIUM` may select an installed browser executable for the **test only**. CI also enforces the browser test when `CI` is set. Outside CI, a missing browser is an explicit skip; an installed browser that cannot start is a failure. The original development container blocked Chromium's Unix socket creation before any page loaded. The source tests must not be described as a successful live merchant/browser commissioning result.

## What each process does

Run one process, config, token, dedicated UI session, and state directory per marketplace/store connection. Several storefronts can map to the same kitchen through independently provisioned server connections. Store routing comes from that mapping, never from a restaurant name or incoming client tenant ID.

1. Check the current official app/browser context, exact source store ID, and reviewed screen guards.
2. Read all configured order views. Read each complete order twice, including item/option counts, and reject incomplete or inconsistent snapshots.
3. Send the normalized observation through the scoped MealDeck endpoint. The server owns the immutable import, kitchen scope, holds, and source-of-payment category.
4. In `live` mode, claim at most one server-authorized command. `observe` mode imports orders but never claims or clicks an order action.
5. Check the exact source store, full order ID, display reference, current state, supported action and fulfilment. Admit a fresh full food snapshot to the server before dispatch.
6. Commit a durable possible-dispatch record, then read the food snapshot again immediately before a single bounded action. Changed food, expired leases, stopped workers, wrong identities, missing buttons, or unsupported actions prevent that click.
7. Re-read the same order, including its full food snapshot, and require fresh server admission before any `confirmed` result. A success toast, vanished card, HTTP request completion, local kitchen change, or button click alone is insufficient.

No private marketplace API, client impersonation, CAPTCHA bypass, credential export, or arbitrary Appium shell/script endpoint is used. Browser sign-in stays with the operator. Merchant UI data never becomes an instruction to an AI agent.

## Order and status rules

| Requirement              | Bridge behaviour                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original number on KDS   | `displayReference` stays a string, preserving letters, punctuation and leading zeroes. There is no implicit trimming or number conversion.                                                                                                                       |
| Stable identity          | `platform + externalStoreId + externalOrderId` identifies the source order. The full stable ID must be extracted from the actual source. A short customer display reference is not automatically a stable ID.                                                    |
| Missing source line IDs  | A deterministic `ui:<content-hash>:<occurrence>` identifies a frozen UI line. This is explicitly bridge-generated, not a vendor SKU or menu mapping.                                                                                                             |
| Original food and prices | Keep all purchased quantities, modifiers, line notes and order notes. `unitPricePence` is the exact displayed **unit** item price; missing/unreliable unit prices remain `null`. Do not parse a line total as a unit price or reconstruct prices from modifiers. |
| Source order total       | Preserve the displayed GBP `totalPence` independently. It need not equal a sum of item unit prices because source discounts, fees and other amounts may differ. MealDeck direct-order promotions are not reapplied.                                              |
| Payment responsibility   | The reviewed UI profile must map an actual source payment label to `platform`. Cash, unknown, unmapped or absent payment evidence is not silently accepted. No Stripe payment is fabricated or initiated.                                                        |
| Accept                   | Supported only for a commissioned control and expected source state. A matching confirmed state of accepted/preparing/ready/handed-over can prove the action already happened.                                                                                   |
| Preparing                | Separate only where the actual merchant interface supports it. An unavailable button returns unsupported; local kitchen progress does not create a customer update.                                                                                              |
| Ready                    | Server KDS rules must first require all items ready and sealed packing. The bridge then performs only the commissioned source Ready action. “Ready to pack” is not courier-ready.                                                                                |
| Handover                 | Limited by the actual source UI and fulfilment capability. Courier-owned pickup/delivery is not synthesized. The demo deliberately disables merchant handover for platform delivery.                                                                             |
| Changed/cancelled order  | The server can hold that order. Other orders continue importing and processing; the held target cannot be acted on.                                                                                                                                              |

The marketplace remains responsible for the wording and timing of its customer updates. Reading a merchant state does not prove a customer opened or received a notification.

## Commission a real source profile

Real source commissioning still needs the merchant interfaces and the Sunmi model/Android version. Confirm that automation is permitted for the account and device. Uber's published UK acceptable-use policy restricts automated access; an owned account or a working script does not itself provide permission. A managed Just Eat terminal may require its administrator's approved installation/debug access. Do not root/reset a managed terminal or work around its restrictions.

Once access is established:

1. Record the actual browser/app/device version and permitted-access reference. For Sunmi, choose and pin a compatible Appium/UiAutomator2 toolchain after checking the actual Android version. Keep Appium bound to loopback and use only an authorized connected device.
2. Observe the real merchant UI and its source IDs. Verify the exact current store; complete new, active, ready and relevant history views; complete food/option rows; source payment interpretation; original reference; currency; and timestamps. If a stable ID or complete order cannot be observed, leave the profile unconfigured.
3. Create a local profile using the schema below. Do not copy the synthetic selectors into a live profile or guess labels. Test each supported action and its actual readback location against the intended merchant setup. Leave unsupported actions `null` and disable them in the server connection.
4. Provision the matching server store/kitchen/brand/station, token hash, profile ID/version and capabilities through the reviewed administrative deployment path. The bridge gets only its own high-entropy per-connector token, never the Supabase service key. The separate server release settings and enabled connection are also required.
5. Compare `observe` imports against the original source orders. This mode **does import into the configured server**, so it belongs to the intended commissioning environment; it is not a dry run.
6. Enable `live` only after the actual controls, source readback and kitchen/customer behaviour have been accepted for that store. Record unsupported lifecycle steps accurately. Bump the profile version and recheck its matching server configuration whenever selectors or interpretations change.

The app does not automate setup, sign-in, multi-factor challenges, support contact, or device administration. Normal platform controls remain available while a connection is unconfigured or held.

### Profile shape

The two `profiles/*.unconfigured.json` files identify the intended transports without supplying invented selectors. The fully executable schema example is `demo/fixture.mjs`, clearly marked `environment: "fixture"`; live configuration loading rejects fixture profiles.

| Profile section     | Required information                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | `schemaVersion: 1`, `platform`, `environment: "live"`, `profileId`, string `profileVersion`, and the platform's transport.                                                                                                                                                                                                                                                   |
| Commissioning       | `status: "verified"`, actual `accessAuthorizationReference`, `deviceOrBrowserVersion`, and `verifiedAt`. An optional `expiresAt` is enforced even while the process stays running.                                                                                                                                                                                           |
| Context             | Uber `pageUrl` on `https://merchants.ubereats.com`; Just Eat `appPackage: "com.justeat.orderpad"`. An unexpected current page/package stops reading and actions.                                                                                                                                                                                                             |
| Screen              | `storeId`, at least one exact `guards[]` field/value, `orders`, `empty`, `orderCount`, and separate `identity.externalOrderId` / `identity.displayReference`.                                                                                                                                                                                                                |
| Detail view         | Optional `screen.detail` has a read-only `open`, `root`, `close` and independently checked `identity`. It must not select an order action as navigation.                                                                                                                                                                                                                     |
| Tabs/readback views | Optional `screen.views[]` contains up to six named views, each with a reviewed `navigate` selector and exact `guard`. It may override `orders`, `empty`, `orderCount`, `identity` and `detail`. New/active/history navigation uses these fixed controls and searches the full identity; disappearance never proves handover. Field extraction layout is shared across views. |
| Fields              | `state`, `fulfilment`, `paymentResponsibility`, `currency`, `placedAt`, `totalPence`, optional `notes`, and `items`. State/fulfilment/payment use explicit exact-value maps.                                                                                                                                                                                                 |
| Items               | Row `selector`, total line `count`, `name`, `quantity`; optional original `externalLineId`, exact `unitPricePence`, and `notes`. When modifiers are present, configure their row selector, per-item count, name and quantity.                                                                                                                                                |
| Actions             | `accept`, `preparing`, `ready`, `handover`, each `null` or a bounded `button`, allowed `fromStates`, allowed `fulfilments`, and optional confirmation dialog with its own exact order identity and button.                                                                                                                                                                   |

A field is `{ "selector": { "using": "…", "value": "…" }, ... }`. It can read element text or a named attribute. Supported formats are `text`, `integer`, `minor_units`, `gbp`, `iso_datetime`, and `epoch_ms`. Relative times such as “5 minutes ago” are not guessed into order timestamps. Optional fields explicitly use `optional: true`; absent optional unit prices stay null.

Any text transformation must be declared in the reviewed profile: optional `trim: true`, an anchored `capture` regex with exactly one capture group, or an exact `map`. Identifiers remain strings. Source text, JSON, credentials and arbitrary code are never executed.

Uber selectors use CSS and fixed element handles, so a reordered list cannot retarget a click to another row by index. Android prefers `id` or `accessibility id`; XPath is restricted to descendant/child paths with exact attribute or numeric predicates. Union, parent/ancestor/following axes and function expressions are rejected both in profile loading and transport. The worker has no arbitrary scripts, shell, package-install, unlock or coordinate-click methods.

Counts must prove the observed order list, item list and configured modifier lists are complete. Pagination, virtualized rows, scrolling-only content, differing per-view field layouts, unsupported date/amount formats and app dialogs need a reviewed adapter extension before activation. The current worker fails closed on those incomplete views rather than silently dropping food or orders.

### Local configurations

Copy each example to its own ignored local filename, supply the real connector/store identifiers, and point it at its reviewed local profile. Keep credentials in the named environment variables supplied by the server setup. Do not place tokens, device serials, session cookies or captured customer screens in source control.

```bash
node src/cli.mjs check --config config.uber-eats.local.json
node src/cli.mjs run --config config.uber-eats.local.json
```

Run Just Eat as a separate supervised process with `config.just-eat.local.json`. Its `MEALDECK_JUST_EAT_DEVICE_ID` is used only with the local Appium server. Its app must already be open on the permitted device; the bridge does not reset or force-launch it. Uber uses a dedicated visible Chrome profile, requiring Google Chrome on the host and manual merchant sign-in.

The live server URL must use HTTPS and the root origin. The API path is fixed. Redirects are not followed. No connector token is placed in URLs or diagnostics.

## Recovery and operations

`commands.sqlite` stores command UUIDs, one-way identity fingerprints, dispatch flags, outcomes and timestamps; it does not store source customer/order payloads or bearer tokens. FULL synchronous commits precede order actions. A separate `ownership.sqlite` holds a lifetime exclusive lock, preventing two workers from sharing that state directory while allowing the operating system to release ownership after a crash. The per-store browser directory contains a real login session and must remain private.

Keep the state directory on a reliable local disk and run only one process per source/device session. A supervision restart reuses the same state. **Never delete the journal to make an uncertain action retry.** The server's expired lease also changes to reconciliation mode, so loss of a local journal does not authorize a new click. Durable command identity excludes changing lease tokens and current expected states.

Both an existing possible-dispatch record and a server `reconcile` command permit only reading and reporting. Unknown outcomes stay held until the same source order can be verified; they do not trigger automatic repeated clicks. There is no claim of a distributed exactly-once transaction across a browser/device and PostgreSQL.

Heartbeat `serverTime` anchors a conservative monotonic clock for lease decisions. An expired lease cannot be extended by a slow HTTP response or a slightly wrong host clock. Maintain the host clock normally; a large discrepancy stops the connection.

Ctrl-C/SIGTERM prevents new claims and new order/confirmation clicks. Already-dispatched work can finish its bounded readback/report; uncertainty remains durable. A confirmation dialog is not clicked after a stop request.

Inspect the local health file without dumping identities or credentials:

```bash
node src/cli.mjs status --config config.uber-eats.local.json
```

Health includes status, platform, mode, last tick/healthy times, observed/held order counts and a safe command status. Staleness is reported after 90 seconds. Logs contain state changes and fixed error codes only. A held individual order remains visible to staff without starving other orders. A wrong store, missing session, unreadable UI, or failed source guard degrades the connection as a whole.

## Protocol and verification

All requests are `POST /api/marketplace/bridge` with `{ op, connectorId, payload }` and a per-connector bearer token. Operations are `heartbeat`, `observe`, `claim`, and `result`. Profile evidence is included on every operation. A confirmed result carries the exact fresh `externalStoreId`, `externalOrderId`, `displayReference`, `observedState` and `observedAt` readback.

The authoritative web contract is `src/lib/mealdeck-marketplace-protocol.ts` at the repository root. Commands are lease-scoped and use `execute` or `reconcile`; only the server decides which local KDS action may create one. This package cannot create a restaurant command from an arbitrary local prompt.

Tests exercise the complete normalized snapshot, original references, nullable unit prices, unsupported actions, wrong identities, missing rows/options, full-snapshot admission on every confirmation path, changed food before/after a click, fresh/expired leases, advanced states across reconcile leases, lost click responses, process crashes, singleton ownership, individual held-order isolation and stopping an in-flight worker. Appium tests use a **protocol fixture**, not a Sunmi device. The browser test uses a **synthetic HTML merchant page**, not Uber's website.

## Upstream provenance

This package's application code is written for MealDeck. It does not copy an unofficial Uber/Just Eat consumer-order scraper or paid aggregator connector.

- [Microsoft Playwright](https://github.com/microsoft/playwright), pinned here to **1.65.0**, Apache-2.0. Used for standard browser element reads/actions and a dedicated persistent context; see [persistent context documentation](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context).
- [Appium UiAutomator2](https://github.com/appium/appium-uiautomator2-driver), Apache-2.0. A separately commissioned compatible installation is required; see [Android setup](https://appium.io/docs/en/latest/quickstart/uiauto2-driver/) and [server security](https://appium.io/docs/en/latest/guides/security/). This package implements only its narrow W3C-compatible HTTP calls and current-package read.
- [W3C WebDriver](https://www.w3.org/TR/webdriver2/) for the element/session protocol. No app internals or network APIs were reverse-engineered.
- [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) and [SQLite synchronous behaviour](https://www.sqlite.org/pragma.html#pragma_synchronous) for the local durable journal.
- [Uber UK acceptable-use policy](https://www.uber.com/gb/en/legal/app-and-website-acceptable-use-policy/) and [SUNMI managed-device context](https://www.sunmi.com/en/partner/) remain relevant to permitted live access. Their existence does not establish access for this particular store or terminal.

Source compilation, automated tests, server/database installation, a permitted device session, supported merchant actions and visible customer updates are separate outcomes. Record each only when it has actually been observed.
