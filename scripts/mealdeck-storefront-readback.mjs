import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGIN = "https://mealdeck.co.uk";
const LIMIT = 2_500_000;
const PATHS = ["/", "/offers", "/meta-ad", "/menus", "/opening-offer", "/sitemap.xml"];
const EXPIRED = /opening weekend has finished|opening[- ]weekend offer|opening[- ]weekend discounts|6[–-]8 November|30% off everything|99p milkcake promotion|double loyalty points/i;

function publicMarkup(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
}

function visibleText(html) {
  return publicMarkup(html).replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/\s+/g, " ").trim();
}

async function boundedText(response) {
  if (!response.body || Number(response.headers.get("content-length") || 0) > LIMIT)
    throw new Error("Invalid body size");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > LIMIT) throw new Error("Response too large");
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function sameOffersRedirect(response) {
  if (![301, 308].includes(response.status)) return false;
  try {
    const location = response.headers.get("location");
    if (!location) return false;
    const destination = new URL(location, ORIGIN);
    return destination.origin === ORIGIN && destination.pathname === "/offers" &&
      !destination.username && !destination.password && !destination.search && !destination.hash;
  } catch {
    return false;
  }
}

/** Public GET-only readback. Fixed origin and paths; no payment or customer APIs. */
export async function probeStorefrontRelease(fetcher = fetch) {
  const checks = {};
  const httpStatus = {};
  for (const path of PATHS) {
    checks[path] = false;
    httpStatus[path] = null;
    try {
      const response = await fetcher(new URL(path, ORIGIN).href, {
        method: "GET", credentials: "omit", cache: "no-store", redirect: "manual",
        headers: { Accept: path === "/sitemap.xml" ? "application/xml,text/xml" : "text/html",
          "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      httpStatus[path] = response.status;
      if (path === "/opening-offer") {
        checks[path] = sameOffersRedirect(response);
        await response.body?.cancel().catch(() => {});
        continue;
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const type = response.headers.get("content-type") || "";
      const xml = path === "/sitemap.xml";
      if (xml ? !/(?:application|text)\/xml/i.test(type) : !/text\/html/i.test(type)) {
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const body = await boundedText(response);
      if (xml) {
        checks[path] = /<urlset\b/i.test(body) &&
          /<loc>\s*https:\/\/mealdeck\.co\.uk\/offers\s*<\/loc>/i.test(body) &&
          !/<loc>[^<]*\/opening-offer(?:[/?#][^<]*)?\s*<\/loc>/i.test(body);
        continue;
      }
      const markup = publicMarkup(body);
      const text = visibleText(body);
      if (!/<main\b/i.test(markup) || EXPIRED.test(text) ||
          /href\s*=\s*["'](?:https:\/\/mealdeck\.co\.uk)?\/opening-offer(?:[?#][^"']*)?["']/i.test(markup)) continue;
      checks[path] = path === "/" ? /Five menus\. One basket\./i.test(text) :
        path === "/offers" ? /£1 paid = 1 loyalty point/i.test(text) :
        path === "/meta-ad" ? /Opening hours · UK time/i.test(text) :
        /Search all MealDeck menus/i.test(text) && /Your favourites/i.test(text);
    } catch {
      // Fixed boolean and status only. Never emit raw response bodies, URLs
      // containing user data, response headers, cookies or provider errors.
    }
  }
  return {
    checks, httpStatus,
    storefrontContentVerified: Object.values(checks).every(Boolean),
    exactDeployedCommitVerified: false,
    checkoutPaymentAndDeviceAcceptanceVerified: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--live")) {
    console.log("Read-only storefront verification: pass --live for six public GET requests.");
  } else {
    const result = await probeStorefrontRelease();
    console.log(JSON.stringify(result, null, 2));
    if (!result.storefrontContentVerified) process.exitCode = 2;
  }
}
