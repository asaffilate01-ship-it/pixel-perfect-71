# MealDeck local receipt bridge

This is the runnable local consumer for the MealDeck `/printer` terminal. It sends **one bounded ESC/POS receipt per authorized job** to one locally configured TCP printer. It uses only Node built-ins; the MealDeck app does not need a browser extension or a printer SDK.

**Hardware setup remains required.** No printer model has been supplied or physically tested. This implementation supports a printer with a compatible raw TCP ESC/POS interface, typically on port 9100. It does not claim support for every USB, Bluetooth, AirPrint, Windows spooler or vendor-specific printer. It does not promise that a socket write produced paper, that a cutter is present, or that an arbitrary printer stops feeding at exactly the same physical position.

## Install and run on the printer computer

Use Node 22 or newer on a POSIX system (Linux or macOS) with a persistent local disk. The journal uses owner-only file permissions, exclusive file creation, atomic rename and file/directory `fsync`. Windows storage semantics are not validated by this adapter. Do not run it from an ephemeral container, network share, cloud-synced folder or a directory that is cleared on restart.

1. Give the supported receipt printer a fixed private IPv4 address. Check its manufacturer's documented ESC/POS mode, paper width and raw TCP port. Configure that address locally; the browser cannot change it.
2. Provision a **locally trusted TLS certificate** with `127.0.0.1` in its IP subject alternative names. Install the issuing CA into the printer computer's operating system/browser trust store, and keep the certificate private key readable only by the service account (`0600`). A certificate warning is not an acceptable production setup. The bridge will not fall back to HTTP.
3. Copy `config.example.json` into a private local configuration directory outside the checkout. Set its fixed printer address, certificate/key paths, persistent state directory and the **MealDeck publishable key or legacy anon key**. The example key is intentionally a non-working placeholder. Never enter a `service_role`, secret API key, staff password or refresh token here. The independently configured backend is pinned to `https://srsxybepwujuawyutnbs.supabase.co`.
4. Keep `serviceOrigin` as `https://127.0.0.1:17443`. Keep `allowedOrigins` as the exact production origin `https://mealdeck.co.uk`. Add another exact HTTPS origin only if that deployment is trusted and actually used. Wildcards, HTTP origins, omitted Origin headers and arbitrary Host headers are denied. The listener binds only to loopback, so the bridge must run on the same computer as the `/printer` browser session.
5. Start the service under the same local account that owns its private files:

```sh
node tools/receipt-bridge/server.mjs --config /private/mealdeck/bridge.local.json --pair
```

6. On that computer, open `https://mealdeck.co.uk/printer`, sign in as an assigned printer operator, and enter the pairing code displayed in the local terminal. A code expires after five minutes, accepts at most five attempts and can be used once. An interactive local terminal accepts `pair` for a new code, or `revoke-pairs` to revoke every paired connection. A service without a TTY can restart with `--pair`; this never retries an old receipt. `--revoke-pairs --pair` revokes old pair tokens before opening a new pairing window.
7. The browser may ask for local-network access. The exact browser/OS combination must be tested during setup. HTTPS on the public site does not by itself establish trust in a local certificate, grant local-network permission, or provide USB/Bluetooth access. Keep the printer terminal in the foreground and prevent the computer from sleeping while it is responsible for printing.

No actual printer address, certificate, pairing token or backend credential is included in this repository. Run `node tools/receipt-bridge/server.mjs --help` for CLI syntax.

## Receipt content and finishing

The canonical receipt includes the order's four-digit code, actual paid time, kitchen acceptance time, location, collection/kerbside method, customer name, vehicle make/colour/last four registration characters for kerbside, every item, named option/flavour, itemised paid extras, exact totals/discount, bag numbers and allocations, cutlery request, order instructions, MealDeck and its trading name. The earlier checkout draft creation time is retained in the DTO but is not printed as the placed time.

Each item is rendered once with its line total and its own bag numbers/quantities next to its full choices. This distinguishes two identically named burgers with different flavours in different bags. Its base and modifier prices explain that total; the printer does not add the displayed amounts again. Separate cross-brand extras remain separate lines and say which parent item they belong to. Each bag includes the extras belonging to the meal in that bag. `validateReceipt` checks base + modifiers = unit, unit × quantity = line, all lines = subtotal, and subtotal − discount = total. It also checks every bag quantity and that extras stay with their parent allocation.

The encoder sends one initialise command, printable ASCII and newlines, then the final `END OF RECEIPT` marker, configured feed lines and at most one optional cutter command. There are no copy/repeat, cash-drawer, raster-image, arbitrary command or form-feed inputs. The caller cannot supply raw printer bytes. It rejects a receipt over 600 rendered lines or 32 KiB as a whole before opening a printer connection; HTTP and canonical backend responses are also bounded to 128 KiB. There are at most 180 order lines and 10 bags.

| Local printer option | Default | Allowed values / effect                                                             |
| -------------------- | ------- | ----------------------------------------------------------------------------------- |
| `columns`            | `42`    | `32`, `42`, `48`; choose the width actually supported by the configured font/paper. |
| `feedLines`          | `3`     | Integer `0`–`5`; final newline feed after the end marker.                           |
| `cut`                | `none`  | `none`, `partial`, `full`; optional final `GS V` command only.                      |
| `timeoutMs`          | `5000`  | `1000`–`15000`; one TCP connection/write attempt, no transport retry.               |

Leave cutting disabled until the specific model is confirmed to support the selected command. Epson documents that support and behaviour of [GS V vary by model and mode](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html). Feed distance, cutter location and printer firmware may affect physical paper movement. The application stops sending after the single bounded receipt; hardware behaviour still needs a paper test.

For portability, amounts use `GBP`, common accents and typographic punctuation are transliterated, and unsupported characters become `?` with an explicit warning on the receipt and job response. No printer code page is guessed. Full original text remains on the secure order screen.

## Authority and browser API

There are two independent checks before any new hardware write:

- **Local device authorization:** the exact trusted Origin, exact loopback Host and an origin-bound paired bearer token. Pair tokens are returned once and held in browser session memory; only their hashes are saved locally. Pairing controls access to the local device; it does not prove an order is paid.
- **MealDeck order authorization:** the bridge sends the current short-lived staff access JWT to the fixed MealDeck RPC `mealdeck_printer_claim_receipt(p_job,p_claim)`. That RPC requires the authenticated, authorized claimant, the unexpired claim token, a job already in `sending`, verified Stripe payment and accepted order state. The bridge verifies the returned job ID and renders the canonical immutable receipt returned by that RPC. If the browser payload differs, it rejects the job. No browser-selected backend, RPC, printer address, OS path or command is accepted.

Access JWTs remain in memory for that request only. The bridge does not store or log JWTs, refresh tokens, receipts, customer names, vehicle details or item notes. The persistent journal contains job/order IDs, copy number, receipt hash, state, timestamps, token hashes and recovery/reprint reasons. Operators should avoid personal information in recovery reasons. Upstream error bodies are never returned to the browser or written to logs.

All endpoints are under the fixed `https://127.0.0.1:17443`. All requests require the exact trusted Origin; JSON POSTs require `Content-Type: application/json`. Authenticated `GET /v1/recovery` returns `{jobs:[...]}` with up to 100 held jobs, oldest first, using the same minimal public status format and no receipt/customer text. Resolve inspected jobs, then query again for any remaining holds. This lets the operator recover local holds even when the corresponding server card has aged out of the recent-job board.

| Endpoint                       | Request                                                                                   | Result                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/health`               | Trusted Origin; no pair token needed                                                      | `{status:"ready",schemaVersion:1,requiresPairing:true}`; does not claim a printer is configured correctly or paper is available.        |
| `POST /v1/pair`                | `{code}`                                                                                  | `{bridgeId,origin,token}`; consumes the local pairing code.                                                                             |
| `GET /v1/status`               | Paired bearer token                                                                       | Bridge ID, current busy/recovery status and fixed profile.                                                                              |
| `POST /v1/jobs`                | Paired bearer token, `X-Mealdeck-Access-Token: <staff JWT>`, `{jobId,claimToken,receipt}` | One new verified attempt; status `sent_unconfirmed`, `held` or `failed`. Repeated IDs only return existing status and never send again. |
| `GET /v1/jobs/:jobId`          | Paired bearer token                                                                       | Existing durable job status, or 404. Reconnect should query this endpoint.                                                              |
| `POST /v1/jobs/:jobId/resolve` | Paired bearer token, `{outcome:"printed"                                                  | "not_printed",reason}`                                                                                                                  | Audited operator paper confirmation; this endpoint never prints anything. |

The exact DTO and browser-safe validation/encoder exports are in `receipt.mjs` and `receipt.d.mts`. CORS preflight permits only the documented methods and headers; private-network CORS acknowledgement is returned only for an exact trusted Origin. TLS errors, local-network permission denial and offline MealDeck authorization stop a new print safely.

## One-copy and recovery rules

The bridge reserves a job and its receipt hash durably **before** it can write printer bytes. It marks `sending` durably before the single socket write. It deduplicates both job ID and order/copy number. A refresh, reconnect, backend replay or process restart never causes an old receipt to be printed again. Multiple bridge processes cannot share the journal: an exclusive lock stops the second process.

Successful network transmission produces `sent_unconfirmed`. The operator must inspect the actual paper and confirm it in the printer terminal. This is deliberately separate from the browser's print dialog or network success. A lost connection after a possible write, an interrupted process or an unexpected adapter failure leaves a `held` job. A held job blocks new hardware sends until the operator checks the printer and records an outcome and reason. A connection failure known to occur before bytes were attempted is `failed`, but is still not retried automatically.

If a replacement is needed, the server must create a new explicit job with the next copy number, original job reference and reason. The local original and all earlier copies must have recorded paper outcomes first. A reprint is labelled `REPRINT - COPY N` and sent once. The resolve endpoint itself cannot produce a replacement. Do not infer that an order did not print merely because a tab disconnected.

After a clean shutdown, the lock is removed. After a crash, a stale `bridge.lock` deliberately prevents an automatic restart until a local operator confirms there is no surviving bridge process and no pending hardware write. Stop the service, check the recorded PID/process, inspect the printer, and remove **only the stale lock** when it is safe. Restart with the same state directory: previous `reserved` or `sending` entries become held and require paper review. Do not delete `state.json` or `identity.json` to bypass this check.

The identity marker prevents silent reinitialization if a previously used journal file disappears. Corruption, bad permissions or a durable-write failure stops printing. Keep state and identity backups together, and never roll back a live journal to an older backup to retry jobs: that discards deduplication evidence. After disk loss, rebuild only after reconciling all affected server jobs and actual paper; the bridge cannot prove what was printed if its history has been destroyed. The ledger is capped at 50,000 attempts and 20 pair tokens. Capacity errors fail closed; archive/rotation requires an operational retention plan that preserves deduplication, not deleting old live entries.

## Verification

```sh
node --test tools/receipt-bridge/test/*.test.mjs
```

Tests exercise the real loopback HTTP handler and TCP consumer with a fake printer, plus canonical backend authorization, exact receipt arithmetic/itemisation, bag allocations, bounded encoder output and one cutter, origin/Host/CORS/pairing guards, private durable journal, restart recovery, deduplication, explicit copies and uncertain sends. They do not call the hosted database, Stripe or a physical printer. A hardware commissioning check with the actual model, paper/cutter profile, local TLS trust, browser permission and paper confirmation remains necessary before enabling unattended receipt consumption.
