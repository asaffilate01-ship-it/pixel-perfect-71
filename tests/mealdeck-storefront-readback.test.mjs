import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORIGIN, probeStorefrontRelease } from "../scripts/mealdeck-storefront-readback.mjs";

const html = (text) => "<html><main>" + text + "</main></html>";
const pages = {
  "/": html("Five menus. One basket."),
  "/offers": html("£1 paid = 1 loyalty point."),
  "/meta-ad": html("Opening hours · UK time"),
  "/menus": html("Search all MealDeck menus. Your favourites"),
  "/sitemap.xml": "<urlset><url><loc>https://mealdeck.co.uk/offers</loc></url></urlset>",
};

function fixture(overrides = {}) {
  const calls = [];
  const request = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, ORIGIN);
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "manual");
    assert.equal(init.body, undefined);
    calls.push(parsed.pathname);
    if (overrides[parsed.pathname]) return overrides[parsed.pathname]();
    if (parsed.pathname === "/opening-offer")
      return new Response(null, { status: 301, headers: { location: "/offers" } });
    return new Response(pages[parsed.pathname], {
      headers: { "content-type": parsed.pathname === "/sitemap.xml" ? "application/xml" : "text/html" },
    });
  };
  return { calls, request };
}
const page = (body, status = 200) => () => new Response(body, { status, headers: { "content-type": "text/html" } });

describe("Production storefront readback", () => {
  it("checks six public surfaces, not exact commit or operational readiness", async () => {
    const site = fixture();
    const result = await probeStorefrontRelease(site.request);
    assert.equal(result.storefrontContentVerified, true);
    assert.equal(result.exactDeployedCommitVerified, false);
    assert.equal(result.checkoutPaymentAndDeviceAcceptanceVerified, false);
    assert.deepEqual(site.calls, ["/", "/offers", "/meta-ad", "/menus", "/opening-offer", "/sitemap.xml"]);
  });
  it("rejects stale campaign copy, a stale menu or an old footer link", async () => {
    for (const overrides of [
      { "/": page(html("Five menus. One basket. Opening weekend has finished.")) },
      { "/menus": page(html("Search this menu")) },
      { "/offers": page(html('£1 paid = 1 loyalty point. <a href="/opening-offer">Old offer</a>')) },
      { "/": page(html("Five menus. One basket."), 503) },
    ]) assert.equal((await probeStorefrontRelease(fixture(overrides).request)).storefrontContentVerified, false);
  });
  it("does not confuse inert hydration strings with visible expired copy", async () => {
    const markup = html("Five menus. One basket.") + '<script>const historical = "Opening weekend has finished.";</script>';
    assert.equal((await probeStorefrontRelease(fixture({ "/": page(markup) }).request)).storefrontContentVerified, true);
  });
  it("requires a permanent same-origin redirect without secret or arbitrary destinations", async () => {
    for (const [status, location] of [[302, "/offers"], [301, "https://elsewhere.example/offers"], [301, "/offers?token=private"], [301, "/menus"]]) {
      const site = fixture({ "/opening-offer": () => new Response(null, { status, headers: { location } }) });
      assert.equal((await probeStorefrontRelease(site.request)).checks["/opening-offer"], false);
    }
  });
  it("fails for stale sitemap, oversized response and network errors", async () => {
    const sitemap = '<urlset><loc>https://mealdeck.co.uk/offers</loc><loc>https://mealdeck.co.uk/opening-offer</loc></urlset>';
    const stale = fixture({ "/sitemap.xml": () => new Response(sitemap, { headers: { "content-type": "application/xml" } }) });
    assert.equal((await probeStorefrontRelease(stale.request)).checks["/sitemap.xml"], false);
    assert.equal((await probeStorefrontRelease(fixture({ "/": page("x".repeat(2_500_001)) }).request)).checks["/"], false);
    const unavailable = await probeStorefrontRelease(async () => { throw new Error("offline"); });
    assert.equal(unavailable.storefrontContentVerified, false);
    assert.equal(Object.values(unavailable.checks).some(Boolean), false);
  });
});
