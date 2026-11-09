import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("MealDeck secure driver deployment surface", () => {
  test("registers driver route and private kitchen dispatch without changing paid-order authority", () => {
    const routes = source("src/routeTree.gen.ts");
    const kds = source("src/components/ops/kds-panel.tsx");
    expect(routes).toContain("DriverRouteImport");
    expect(routes).toContain("'/driver': typeof DriverRoute");
    expect(kds).toContain("OpsDriverDispatchPanel");
    expect(kds).toContain('can("orders.status")');
    expect(kds).toContain('canEnrol={can("staff.manage")}');
  });

  test("driver has a separate installable app with no cached customer or session data", () => {
    const pwa = source("src/lib/mealdeck-pwa-surface.ts");
    const worker = source("public/driver-sw.js");
    const manifest = JSON.parse(source("public/driver.webmanifest")) as {start_url: string; scope: string; name: string};
    expect(manifest).toMatchObject({start_url: "/driver", scope: "/driver", name: "MealDeck Driver"});
    expect(pwa).toContain('worker: "/driver-sw.js"');
    expect(pwa).toContain('manifest: "/driver.webmanifest"');
    expect(worker).not.toContain("cache.put");
    expect(worker).not.toContain("caches.open");
    expect(source("src/lib/mealdeck-driver-browser.ts")).toContain("mealdeck-driver-");
  });

  test("driver cannot mark an order delivered or bypass KDS sealed-bag handoff", () => {
    const backend = source("deploy/mealdeck/post-install-migrations/20261108154500_mealdeck_driver_pwa_dispatch.sql");
    expect(backend).toContain("o.payment_status='paid'");
    expect(backend).toContain("kds_release_evidence");
    expect(backend).toContain("driver_status='with_driver'");
    expect(backend).toContain("The existing protected");
    expect(backend).not.toMatch(/update public\.orders set status\s*=\s*'fulfilled'/);
  });
});
