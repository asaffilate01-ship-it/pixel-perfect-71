import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORIGIN, probeStorefrontRelease } from "../scripts/mealdeck-storefront-readback.mjs";

const html = (text) => "<html><main>" + text + "</main></html>";
const pages = {
  "/": html("Five menus. One basket."),
  "/offers": html("£1 paid = 1 loyalty point."),
  "/meta-ad": html("Opening hours · UK time. Choose how you want to receive your order. Enter your name and WhatsApp number."),
  "/menus": html("Search all MealDeck menus. Your favourites"),
  "/privacy": html("20 minutes after each quantity is added. Save menu favourites"),
  "/luton": html("Local takeaway kitchen. Five brands. One kitchen."),
  "/st-albans": html("St Albans coming soon"),
  "/bedford": html("Bedford coming soon"),
  "/blog": html("MealDeck Loyalty: Earn Points on Eligible Orders. House Rules: MealDeck Offers and Member Benefits"),
  "/menus/skorch-burgers": html("Search all MealDeck menus. Your favourites"),
  "/menus/tavo-chicken": html("Search all MealDeck menus. Your favourites"),
  "/menus/souvano": html("Search all MealDeck menus. Your favourites"),
  "/menus/loadd": html("Search all MealDeck menus. Your favourites"),
  "/menus/moktl": html("Search all MealDeck menus. Your favourites"),
  "/blog/cash-in-your-chips-loyalty-points": html("Updated 26 November 2026. Current food guide."),
  "/blog/house-rules-every-offer-explained": html("Updated 26 November 2026. Current food guide."),
  "/blog/deal-everyone-in-group-food-order-luton": html("Updated 26 November 2026. Current food guide."),
  "/blog/french-tacos-luton-ace-of-the-deck": html("Updated 26 November 2026. Current food guide."),
  "/blog/office-lunch-delivery-st-albans": html("Updated 26 November 2026. Current food guide."),
  "/blog/order-direct-pay-less-than-aggregators": html("Updated 26 November 2026. Current food guide."),
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
  it("checks every specified public surface, not exact commit or operational readiness", async () => {
    const site = fixture();
    const result = await probeStorefrontRelease(site.request);
    assert.equal(result.storefrontContentVerified, true);
    assert.equal(result.exactDeployedCommitVerified, false);
    assert.equal(result.checkoutPaymentAndDeviceAcceptanceVerified, false);
    assert.deepEqual(site.calls, ["/","/offers","/meta-ad","/menus","/opening-offer","/sitemap.xml","/privacy","/luton","/st-albans","/bedford","/blog","/menus/skorch-burgers","/menus/tavo-chicken","/menus/souvano","/menus/loadd","/menus/moktl","/blog/cash-in-your-chips-loyalty-points","/blog/house-rules-every-offer-explained","/blog/deal-everyone-in-group-food-order-luton","/blog/french-tacos-luton-ace-of-the-deck","/blog/office-lunch-delivery-st-albans","/blog/order-direct-pay-less-than-aggregators"]);
  });
  it("rejects stale campaign copy, a stale menu or an old footer link", async () => {
    for (const overrides of [
      { "/": page(html("Five menus. One basket. Opening weekend has finished.")) },
      { "/menus": page(html("Search this menu")) },
      { "/offers": page(html('£1 paid = 1 loyalty point. <a href="/opening-offer">Old offer</a>')) },
      { "/": page(html("Five menus. One basket."), 503) },
      { "/blog": page(html("MealDeck Loyalty: Earn Points on Eligible Orders. House Rules: MealDeck Offers and Member Benefits. Double loyalty points")) },
      { "/blog/house-rules-every-offer-explained": page(html("Updated 26 November 2026. 99p milk cake promotion.")) },
      { "/privacy": page(html("Basket expires five minutes after each quantity is added.")) },
      { "/menus/tavo-chicken": page(html("Search this menu")) },
      { "/meta-ad": page(html("Opening hours · UK time. Choose how you want to receive your order. Enter your name and WhatsApp number.") + '<meta name="description" content="30% off everything">') },
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
