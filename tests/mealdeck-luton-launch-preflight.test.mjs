import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  ORIGIN,
  H10S_RELEASE_APK,
  H10S_RELEASE_SHA256,
  probeLutonLaunchSurfaces,
} from "../scripts/mealdeck-luton-launch-preflight.mjs";

const fixtureApk = Buffer.from("fixture signed Android package bytes");
const expectedBinary = {
  sha256: createHash("sha256").update(fixtureApk).digest("hex"),
  size: fixtureApk.length,
};
const expectedManifest = H10S_RELEASE_SHA256 + "  " + H10S_RELEASE_APK + "\n";
const liveHtml = '<html><a href="/downloads/mealdeck-printer-h10s-0.2.3.apk">Download</a>Version 0.2.3</html>';
const deliveryOpen = { available: true, fulfilments: ["pickup", "curbside", "delivery"] };

function fakePublicSite(options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.ok(url.startsWith(ORIGIN + "/"));
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    const path = new URL(url).pathname;
    if (path === "/printer") {
      return new Response(options.page ?? liveHtml, {
        status: options.pageStatus ?? 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (path.endsWith(".sha256")) {
      return new Response(options.manifest ?? expectedManifest, {
        headers: { "content-type": "text/plain" },
      });
    }
    if (path.endsWith(".apk")) {
      return new Response(options.apk ?? fixtureApk, {
        headers: { "content-type": "application/octet-stream" },
      });
    }
    if (path === "/api/checkout") {
      return new Response(JSON.stringify(options.checkout ?? deliveryOpen), {
        status: options.checkoutStatus ?? 200,
        headers: {
          "content-type": options.contentType ?? "application/json",
          "cache-control": options.cacheControl ?? "no-store",
        },
      });
    }
    throw new Error("Unexpected URL: " + path);
  };
  return { calls, fetcher };
}

describe("Luton GET-only publication and delivery preflight", () => {
  it("proves only software surfaces, never paper, driver or postcode sign-off", async () => {
    const site = fakePublicSite();
    const result = await probeLutonLaunchSurfaces(site.fetcher, expectedBinary);
    assert.equal(result.softwareSurfacesVerified, true);
    assert.deepEqual(Object.values(result.checks), Array(7).fill(true));
    assert.equal(result.fullyOperationallyReady, false);
    assert.equal(result.physicalH10SReceiptAccepted, false);
    assert.equal(result.authorisedDriverHandoverAccepted, false);
    assert.equal(result.livePostcodeAndDiscountEnforcementVerified, false);
    assert.deepEqual(site.calls.map(({ url }) => new URL(url).pathname), [
      "/printer",
      "/downloads/mealdeck-printer-h10s-0.2.3.apk.sha256",
      "/downloads/mealdeck-printer-h10s-0.2.3.apk",
      "/api/checkout",
    ]);
  });

  it("rejects checksum substitution and never downloads a mismatched release", async () => {
    const site = fakePublicSite({ manifest: "0".repeat(64) + "  " + H10S_RELEASE_APK });
    const result = await probeLutonLaunchSurfaces(site.fetcher, expectedBinary);
    assert.equal(result.checks.manifestMatchesSignedRelease, false);
    assert.equal(result.checks.downloadedApkMatchesSha256, false);
    assert.equal(result.softwareSurfacesVerified, false);
    assert.equal(site.calls.some(({ url }) => url.endsWith(".apk")), false);
  });

  it("independently hashes the bytes instead of trusting the matching manifest alone", async () => {
    const site = fakePublicSite({ apk: Buffer.from("substituted apk bytes") });
    const result = await probeLutonLaunchSurfaces(site.fetcher, expectedBinary);
    assert.equal(result.checks.manifestMatchesSignedRelease, true);
    assert.equal(result.checks.downloadedApkMatchesSha256, false);
    assert.equal(result.fullyOperationallyReady, false);
  });

  it("requires actual delivery fulfilment and available checkout, not marketing prose", async () => {
    for (const checkout of [
      { available: true, fulfilments: ["pickup", "curbside"] },
      { available: false, fulfilments: ["pickup", "curbside", "delivery"] },
      { available: true, marketing: "Free delivery!" },
    ]) {
      const site = fakePublicSite({ checkout });
      const result = await probeLutonLaunchSurfaces(site.fetcher, expectedBinary);
      assert.equal(result.checks.checkoutOffersActualDelivery, false);
      assert.equal(result.softwareSurfacesVerified, false);
    }
    const copyOnly = await probeLutonLaunchSurfaces(
      fakePublicSite({ page: "<html>Free delivery! 4 km, £15+</html>" }).fetcher,
      expectedBinary,
    );
    assert.equal(copyOnly.checks.printerPageAdvertisesV023, false);
  });

  it("fails closed for invalid HTTP, content-type, or cache controls", async () => {
    for (const changes of [
      { pageStatus: 302 },
      { checkoutStatus: 503 },
      { contentType: "text/html" },
      { cacheControl: "public, max-age=3600" },
    ]) {
      const result = await probeLutonLaunchSurfaces(fakePublicSite(changes).fetcher, expectedBinary);
      assert.equal(result.softwareSurfacesVerified, false);
      assert.equal(result.fullyOperationallyReady, false);
    }
  });

  it("fails closed when a live public endpoint cannot be reached", async () => {
    const result = await probeLutonLaunchSurfaces(async () => {
      throw new Error("no network");
    }, expectedBinary);
    assert.equal(result.softwareSurfacesVerified, false);
    assert.deepEqual(Object.values(result.checks), Array(7).fill(false));
  });
});
