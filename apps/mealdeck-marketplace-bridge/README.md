# MealDeck marketplace bridge — isolated QA

This package carries forward the standalone bridge and synthetic test fixtures from [PR #126](https://github.com/asaffilate01-ship-it/pixel-perfect-71/pull/126), at source commit `0fbf043c3d425c8f2d8bf72515c1aeed6646b199`. It deliberately does **not** port the older KDS, database, HTTP endpoint or route-tree changes.

## Status: fixture-only, not commissioned

- Two separate Sunmi/Android sessions (Uber Eats and Just Eat), plus the optional Uber browser transport, are covered by the retained synthetic fixtures.
- The entrypoint only accepts `check --config ...` with a disabled configuration. `run` and `status` are intentionally rejected. Changing a configuration file does not enable the worker.
- All three example configurations and profiles remain disabled and unconfigured. The runtime modules are retained for test coverage and later reviewed integration. They are not mounted in the website, deployed as a worker, or exposed to an AI tool.
- No external merchant account, terminal, app package, selector, credential, customer or real order is used or authorised by this release.

Use Node 24 and the committed package lockfile:

```sh
cd apps/mealdeck-marketplace-bridge
npm ci --ignore-scripts
npx --no-install playwright install --with-deps chromium
MEALDECK_REQUIRE_BROWSER_TESTS=1 npm test
npm run demo
npm run check -- --config config.uber-eats.example.json
npm run check -- --config config.uber-eats-android.example.json
npm run check -- --config config.just-eat.example.json
```

The tests exercise local DOM and loopback Appium fixtures, exact store and order identity, complete line extraction, independent sessions, journal recovery and at-most-once uncertain actions. The demo uses synthetic in-memory state and temporary journals. The live CLI is disabled even when a configuration is supplied. The independent CI job checks the entrypoint rejection as well as the retained test suite.

See [the reconciliation and commissioning plan](../../docs/mealdeck-marketplace-reconciliation-20261127.md) for the remaining KDS and authorised real-device gates. These tests cannot establish platform approval, real-device compatibility or live order processing.
