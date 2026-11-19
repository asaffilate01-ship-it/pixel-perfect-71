import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/**
 * Read-only public preflight. It performs GET requests only and never reads
 * secrets, places orders, changes delivery settings or initiates payments.
 * It is NOT an operational sign-off: physical receipt and driver tests, and
 * a postcode/discount checkout acceptance test, remain separate gates.
 */
export const ORIGIN = "https://mealdeck.co.uk";
export const H10S_RELEASE_APK = "mealdeck-printer-h10s-0.2.3.apk";
export const H10S_RELEASE_SHA256 =
  "139be5b8f57b99b044b4ce571b10a43852f9e8e77c6d4843d29cadda96470681";
export const H10S_RELEASE_BYTES = 8_726_751;

async function publicGet(fetcher, pathname, accept) {
  const target = new URL(pathname, ORIGIN);
  if (target.origin !== ORIGIN || target.pathname !== pathname)
    throw new Error("Unexpected public preflight URL");
  const response = await fetcher(target.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    credentials: "omit",
    headers: { Accept: accept, "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response || response.status !== 200) throw new Error("Unavailable public endpoint");
  return response;
}

async function boundedText(response, limit) {
  if (Number(response.headers.get("content-length") || 0) > limit)
    throw new Error("Unexpected response size");
  if (!response.body) throw new Error("Missing response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Oversize public response");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function hashBoundedApk(response, maximumBytes = 12_000_000) {
  if (Number(response.headers.get("content-length") || 0) > maximumBytes)
    throw new Error("Oversize APK response");
  if (!response.body) throw new Error("Missing APK bytes");
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error("Oversize APK response");
    }
    hash.update(value);
  }
  return { size, sha256: hash.digest("hex") };
}

export async function probeLutonLaunchSurfaces(fetcher = fetch, expectedBinary = {
  size: H10S_RELEASE_BYTES,
  sha256: H10S_RELEASE_SHA256,
}) {
  const checks = {
    printerPageReachable: false,
    printerPageAdvertisesV023: false,
    manifestMatchesSignedRelease: false,
    downloadedApkMatchesSha256: false,
    checkoutAvailable: false,
    checkoutOffersActualDelivery: false,
    checkoutPrivateNoStore: false,
  };
  try {
    const page = await publicGet(fetcher, "/printer", "text/html");
    const contentType = (page.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      const html = await boundedText(page, 1_500_000);
      checks.printerPageReachable = true;
      // Merely seeing marketing copy or a JS bundle is insufficient. A
      // browser-hydrated version must be checked separately if SSR omits this.
      checks.printerPageAdvertisesV023 =
        html.includes("mealdeck-printer-h10s-0.2.3.apk") &&
        /Version\s+0\.2\.3\b/.test(html);
    }
  } catch {
    // Endpoint access failure never becomes a launch-readiness claim.
  }

  try {
    const manifest = await publicGet(
      fetcher, "/downloads/mealdeck-printer-h10s-0.2.3.apk.sha256", "text/plain",
    );
    const line = await boundedText(manifest, 500);
    const expected = H10S_RELEASE_SHA256 + "  " + H10S_RELEASE_APK;
    checks.manifestMatchesSignedRelease = line === expected || line === expected + "\n";
    if (checks.manifestMatchesSignedRelease) {
      const apk = await publicGet(fetcher, "/downloads/" + H10S_RELEASE_APK, "application/octet-stream");
      const digest = await hashBoundedApk(apk);
      checks.downloadedApkMatchesSha256 =
        digest.size === expectedBinary.size && digest.sha256 === expectedBinary.sha256;
    }
  } catch {
    // A missing or mismatched artifact always fails closed.
  }

  try {
    const checkout = await publicGet(fetcher, "/api/checkout", "application/json");
    if ((checkout.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      const body = JSON.parse(await boundedText(checkout, 50_000));
      checks.checkoutAvailable = body?.available === true;
      checks.checkoutOffersActualDelivery =
        checks.checkoutAvailable && Array.isArray(body.fulfilments) &&
        body.fulfilments.includes("delivery");
      checks.checkoutPrivateNoStore =
        /(?:^|,)\s*no-store\b/i.test(checkout.headers.get("cache-control") || "");
    }
  } catch {
    // No response or invalid contract cannot certify live delivery.
  }
  const softwareSurfacesVerified = Object.values(checks).every((value) => value === true);
  return {
    checks,
    softwareSurfacesVerified,
    livePostcodeAndDiscountEnforcementVerified: false,
    physicalH10SReceiptAccepted: false,
    authorisedDriverHandoverAccepted: false,
    fullyOperationallyReady: false,
  };
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  if (!process.argv.includes("--live")) {
    process.stdout.write("Read-only preflight: pass --live to GET the public site, checkout status, manifest and APK. No orders or payments are created.\n");
  } else {
    const result = await probeLutonLaunchSurfaces();
    process.stdout.write(JSON.stringify(result) + "\n");
    process.stdout.write("NOT A LAUNCH SIGN-OFF: verify 4 km / £15 actual checkout, physical H10S paper and authorised driver handover.\n");
    if (!result.softwareSurfacesVerified) process.exitCode = 2;
  }
}
