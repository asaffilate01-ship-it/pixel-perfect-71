#!/usr/bin/env node

/**
 * Dependency-free audit of the public HTML produced by MealDeck's server.
 * Run against an already running build. This sends only anonymous GET requests
 * to the fixed public routes below; it does not use checkout or customer APIs.
 * The small tag reader is for our generated HTML, not arbitrary HTML sanitising.
 */

const PRODUCTION_ORIGIN = "https://mealdeck.co.uk";
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const CONCURRENCY = 3;
const MENUS = [
  { id: "skorch-burgers", brand: /\bskorch\b/i, category: [/\bsmash\b/i, /\bburgers?\b/i] },
  { id: "tavo-chicken", brand: /\btavo\b/i, category: [/\bchicken\b/i, /\bwings?\b/i] },
  { id: "loadd", brand: /\bload[’']?d\b/i, category: [/\bloaded\b/i, /\bfries\b/i] },
  {
    id: "souvano",
    brand: /\bsouvano\b/i,
    category: [/\b(?:doner|döner|greek|turkish|lamb chops)\b/i],
  },
  { id: "moktl", brand: /\bmoktl\b/i, category: [/\bmocktails?\b/i] },
].map((menu) => ({ ...menu, path: `/menus/${menu.id}` }));
const PRIVATE_PATH =
  /^\/(?:account|checkout|whatsapp|group-order|group-pay|track|ops|kds|printer|auth|api)(?:\/|$)/i;
const AUDIT_MARKER = "seo-audit-private-";

function usage() {
  return "Usage: node scripts/audit-mealdeck-seo.mjs [http://127.0.0.1:5173] [--json]";
}

const arguments_ = process.argv.slice(2);
if (arguments_.includes("--help")) {
  console.log(usage());
  process.exit(0);
}
const jsonOutput = arguments_.includes("--json");
const positionals = arguments_.filter((argument) => !argument.startsWith("--"));
let base;
try {
  if (arguments_.some((argument) => argument.startsWith("--") && argument !== "--json"))
    throw new Error("Unknown option.");
  if (positionals.length > 1) throw new Error("Supply only one base URL.");
  base = new URL(positionals[0] ?? "http://127.0.0.1:5173");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("Use an HTTP(S) origin without credentials, a path, query or fragment.");
  if (typeof fetch !== "function" || typeof AbortSignal.timeout !== "function")
    throw new Error("This script needs Node.js 20 or newer.");
} catch (error) {
  console.error(`${error.message}\n${usage()}`);
  process.exit(2);
}

const entities = {
  amp: "&",
  AMP: "&",
  quot: '"',
  QUOT: '"',
  apos: "'",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (original, entity) => {
    if (!entity.startsWith("#")) return entities[entity] ?? original;
    const isHex = entity[1].toLowerCase() === "x";
    const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : "\ufffd";
  });
}

function attributes(source) {
  const values = Object.create(null);
  const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(attribute)) {
    const name = match[1].toLowerCase();
    // HTML uses the first occurrence of a duplicate attribute.
    if (!(name in values)) values[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

function tags(html, name) {
  const pattern = new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^'">])*)>`, "gi");
  return [...html.matchAll(pattern)].map((match) => attributes(match[1]));
}

function elements(html, name) {
  const pattern = new RegExp(
    `<${name}\\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\\s\\S]*?)<\\/${name}\\s*>`,
    "gi",
  );
  return [...html.matchAll(pattern)].map((match) => ({
    attributes: attributes(match[1]),
    body: match[2],
  }));
}

function textContent(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function inspectHtml(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  // Skip raw-text and inert containers so hydration strings cannot masquerade
  // as a second title, canonical, visible heading or crawlable anchor.
  const markup = withoutComments.replace(
    /<(script|style|template)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const titles = elements(markup, "title").map((element) => textContent(element.body));
  const mains = elements(markup, "main");
  const headings = mains.flatMap((main) =>
    elements(main.body, "h1").map((h1) => textContent(h1.body)),
  );
  const links = tags(markup, "link");
  const metas = tags(markup, "meta");
  const canonicals = links
    .filter((link) => (link.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"))
    .map((link) => link.href ?? "");
  const ogUrls = metas
    .filter((meta) => (meta.property ?? "").toLowerCase() === "og:url")
    .map((meta) => meta.content ?? "");
  const anchors = elements(markup, "a").map((anchor) => ({
    ...anchor.attributes,
    text: textContent(anchor.body),
  }));
  const jsonLd = [];
  const jsonErrors = [];
  for (const script of elements(withoutComments, "script")) {
    if ((script.attributes.type ?? "").toLowerCase() !== "application/ld+json") continue;
    try {
      // Script content is raw text in HTML: entity-decoding it would corrupt
      // otherwise valid JSON-LD strings such as a literal "&quot;" in a name.
      const parsed = JSON.parse(script.body);
      if (!parsed || typeof parsed !== "object")
        throw new Error("Expected a JSON object or array.");
      jsonLd.push(parsed);
    } catch {
      jsonErrors.push("A JSON-LD script does not contain a valid JSON object or array.");
    }
  }
  return { titles, mains, headings, canonicals, ogUrls, anchors, metas, links, jsonLd, jsonErrors };
}

function nodesOfType(documents, type) {
  const matches = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    if ([value["@type"]].flat().includes(type)) matches.push(value);
    Object.values(value).forEach(visit);
  }
  documents.forEach(visit);
  return matches;
}

function resolvedUrl(value, origin = PRODUCTION_ORIGIN) {
  try {
    return new URL(value, origin);
  } catch {
    return null;
  }
}

function listItemUrl(value) {
  return typeof value === "string" ? value : (value?.["@id"] ?? value?.url);
}

async function getPublicDocument(path) {
  const url = new URL(path, base);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: path === "/sitemap.xml" ? "application/xml,text/xml" : "text/html" },
    credentials: "omit",
    // Do not follow redirects into other destinations or hide a soft 404.
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error("Response exceeds the 8 MiB audit limit.");
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  return { status: response.status, html, contentType: response.headers.get("content-type") ?? "" };
}

const pollutedRequests = [
  {
    kind: "query",
    menu: MENUS[0],
    path: `${MENUS[0].path}?brand=tavo-chicken&section=${AUDIT_MARKER}section&token=${AUDIT_MARKER}token&room=${AUDIT_MARKER}room&utm_source=${AUDIT_MARKER}campaign`,
  },
  {
    kind: "query",
    menu: MENUS[1],
    path: `${MENUS[1].path}?brand=${AUDIT_MARKER}unknown-brand&search=${AUDIT_MARKER}search&invite=${AUDIT_MARKER}invite&access_token=${AUDIT_MARKER}access`,
  },
];
const caseRequest = { kind: "case", menu: MENUS[1], path: "/Menus/tavo-chicken" };
const requests = [
  ...MENUS.map((menu) => ({ kind: "menu", menu, path: menu.path })),
  ...MENUS.map((menu) => ({ kind: "legacy", menu, path: `/menus?brand=${menu.id}` })),
  { kind: "sitemap", path: "/sitemap.xml" },
  { kind: "404", path: "/menus/not-a-brand" },
  ...pollutedRequests,
  caseRequest,
  { kind: "overview", path: "/menus?brand=" },
];
const fetched = new Array(requests.length);
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < requests.length) {
      const index = next++;
      try {
        fetched[index] = {
          ...requests[index],
          response: await getPublicDocument(requests[index].path),
        };
      } catch (error) {
        const timeout = ["TimeoutError", "AbortError"].includes(error.name);
        fetched[index] = {
          ...requests[index],
          error: timeout
            ? `GET exceeded ${TIMEOUT_MS / 1000} seconds.`
            : `GET failed: ${error.message}`,
        };
      }
    }
  }),
);

const results = [];
function check(target, name, passed, detail) {
  results.push({ target, check: name, passed: !!passed, ...(!passed && detail ? { detail } : {}) });
}

function auditMenu(request, document) {
  const target = request.path;
  const { menu } = request;
  const canonical = `${PRODUCTION_ORIGIN}${menu.path}`;
  const title = document.titles[0] ?? "";
  const heading = document.headings[0] ?? "";
  check(
    target,
    "one descriptive title for the correct brand and category",
    document.titles.length === 1 &&
      menu.brand.test(title) &&
      /\bmealdeck\b/i.test(title) &&
      /\bluton\b/i.test(title) &&
      menu.category.every((pattern) => pattern.test(title)),
    `Found ${document.titles.length} title(s): ${JSON.stringify(title)}`,
  );
  check(
    target,
    "one main H1 for the correct Luton category",
    document.mains.length === 1 &&
      document.headings.length === 1 &&
      /\bluton\b/i.test(heading) &&
      menu.category.every((pattern) => pattern.test(heading)),
    `Found ${document.mains.length} main(s), ${document.headings.length} H1(s): ${JSON.stringify(heading)}`,
  );
  check(
    target,
    "exactly one clean canonical",
    document.canonicals.length === 1 && document.canonicals[0] === canonical,
    `Expected ${canonical}; found ${JSON.stringify(document.canonicals)}`,
  );
  check(
    target,
    "exactly one matching og:url",
    document.ogUrls.length === 1 && document.ogUrls[0] === canonical,
    `Expected ${canonical}; found ${JSON.stringify(document.ogUrls)}`,
  );
  check(
    target,
    "public menu is indexable",
    !document.metas.some(
      (meta) =>
        /^(?:robots|googlebot)$/i.test(meta.name ?? "") &&
        /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(meta.content ?? ""),
    ),
    "A robots or googlebot meta tag prevents indexing.",
  );
  check(
    target,
    "JSON-LD parses",
    document.jsonLd.length > 0 && document.jsonErrors.length === 0,
    document.jsonErrors.join(" ") || "No JSON-LD object found.",
  );
  const menus = nodesOfType(document.jsonLd, "Menu");
  check(
    target,
    "one Menu schema for this canonical page",
    menus.length === 1 &&
      menus[0].url === canonical &&
      typeof menus[0].name === "string" &&
      menu.brand.test(menus[0].name),
    `Found ${menus.length} Menu node(s); each page needs its own named canonical menu.`,
  );
  const breadcrumbs = nodesOfType(document.jsonLd, "BreadcrumbList");
  const items = breadcrumbs[0]?.itemListElement;
  const validItems =
    Array.isArray(items) &&
    items.length >= 2 &&
    items.every((item, index) => {
      const itemUrl = listItemUrl(item?.item);
      const url = typeof itemUrl === "string" ? resolvedUrl(itemUrl) : null;
      return (
        [item?.["@type"]].flat().includes("ListItem") &&
        item.position === index + 1 &&
        typeof item.name === "string" &&
        item.name.trim() &&
        url?.origin === PRODUCTION_ORIGIN &&
        itemUrl === url.href &&
        !url.search &&
        !url.hash
      );
    });
  check(
    target,
    "one valid BreadcrumbList ending at this menu",
    breadcrumbs.length === 1 &&
      validItems &&
      listItemUrl(items.at(-1).item) === canonical &&
      menu.brand.test(items.at(-1).name),
    `Found ${breadcrumbs.length} BreadcrumbList node(s); expected ordered named items ending at ${canonical}.`,
  );
  const linkedPaths = new Set(
    document.anchors
      .filter((anchor) => {
        if (
          !anchor.href ||
          !anchor.text ||
          (anchor.rel ?? "").toLowerCase().split(/\s+/).includes("nofollow")
        )
          return false;
        const url = resolvedUrl(anchor.href, base);
        return (
          url && [base.origin, PRODUCTION_ORIGIN].includes(url.origin) && !url.search && !url.hash
        );
      })
      .map((anchor) => resolvedUrl(anchor.href, base).pathname),
  );
  const missingLinks = MENUS.filter((entry) => !linkedPaths.has(entry.path)).map(
    (entry) => entry.path,
  );
  check(
    target,
    "all five brand menus have named crawlable clean links",
    missingLinks.length === 0,
    `Missing clean anchor links: ${missingLinks.join(", ")}`,
  );
  const publicMetadata = JSON.stringify({
    titles: document.titles,
    headings: document.headings,
    metas: document.metas,
    canonical: document.canonicals,
    jsonLd: document.jsonLd,
    hrefs: document.anchors.map((anchor) => anchor.href),
  });
  check(
    target,
    "synthetic private query values stay out of public metadata and links",
    !publicMetadata.includes(AUDIT_MARKER),
    "A synthetic query marker appeared in public metadata, JSON-LD, heading or an anchor URL.",
  );
}

function auditSitemap(request) {
  const { path, response } = request;
  const locations = [
    ...response.html.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi),
  ].map((match) => decodeEntities(match[1].trim()));
  check(
    path,
    "XML sitemap contains public locations",
    /<(?:(?:[\w.-]+):)?urlset\b/i.test(response.html) && locations.length > 0,
  );
  check(path, "sitemap URLs are unique", new Set(locations).size === locations.length);
  for (const menu of MENUS)
    check(
      path,
      `contains ${menu.path} once`,
      locations.filter((url) => url === `${PRODUCTION_ORIGIN}${menu.path}`).length === 1,
    );
  const badLocations = locations.filter((location) => {
    const url = resolvedUrl(location);
    return (
      !url ||
      location !== url.href ||
      url.origin !== PRODUCTION_ORIGIN ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      PRIVATE_PATH.test(url.pathname) ||
      /^\/(?:menu|order)\/?$/.test(url.pathname)
    );
  });
  check(
    path,
    "no private routes, query URLs or duplicate menu/order aliases",
    badLocations.length === 0,
    `Unexpected sitemap entries: ${badLocations.join(", ")}`,
  );
}

const documents = new Map();
for (const request of fetched) {
  if (request.error) {
    check(request.path, "public GET completes", false, request.error);
    continue;
  }
  const expectedStatus = request.kind === "404" ? 404 : 200;
  check(
    request.path,
    `HTTP ${expectedStatus}`,
    request.response.status === expectedStatus,
    `Received HTTP ${request.response.status}; redirects are intentionally not followed.`,
  );
  if (request.kind === "404") continue;
  if (request.response.status !== 200) continue;
  if (request.kind === "sitemap") {
    auditSitemap(request);
    continue;
  }
  check(
    request.path,
    "HTML response",
    /\btext\/html\b/i.test(request.response.contentType),
    `Content-Type: ${request.response.contentType || "missing"}`,
  );
  const document = inspectHtml(request.response.html);
  documents.set(request.path, document);
  if (request.kind === "overview") {
    check(
      request.path,
      "empty brand uses the generic Luton menu title",
      document.titles.length === 1 &&
        /\bluton\b/i.test(document.titles[0]) &&
        /\bmealdeck\b/i.test(document.titles[0]) &&
        !MENUS.some((menu) => menu.brand.test(document.titles[0])),
    );
    check(
      request.path,
      "empty brand retains one visible main H1",
      document.mains.length === 1 && document.headings.length === 1,
    );
    check(
      request.path,
      "empty brand canonicalises to the generic menu",
      document.canonicals.length === 1 &&
        document.canonicals[0] === `${PRODUCTION_ORIGIN}/menus` &&
        document.ogUrls.length === 1 &&
        document.ogUrls[0] === `${PRODUCTION_ORIGIN}/menus`,
    );
    check(
      request.path,
      "empty brand remains indexable",
      !document.metas.some(
        (meta) =>
          /^(?:robots|googlebot)$/i.test(meta.name ?? "") &&
          /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/i.test(meta.content ?? ""),
      ),
    );
    continue;
  }
  auditMenu(request, document);
}

const cleanDocuments = MENUS.map((menu) => documents.get(menu.path));
for (const key of ["titles", "headings"])
  check(
    "all five clean menus",
    `unique ${key}`,
    cleanDocuments.every(Boolean) &&
      new Set(cleanDocuments.map((document) => document?.[key][0]?.toLowerCase())).size ===
        MENUS.length,
    `Each clean menu needs its own ${key === "titles" ? "title" : "main H1"}.`,
  );
for (const request of [...pollutedRequests, caseRequest]) {
  const clean = documents.get(request.menu.path);
  const queried = documents.get(request.path);
  if (!clean || !queried) continue;
  check(
    request.path,
    "query values or static-prefix casing cannot change path identity",
    JSON.stringify([clean.titles, clean.headings, clean.canonicals, clean.ogUrls, clean.jsonLd]) ===
      JSON.stringify([
        queried.titles,
        queried.headings,
        queried.canonicals,
        queried.ogUrls,
        queried.jsonLd,
      ]),
    "Title, H1, canonical, og:url or JSON-LD differs from the same clean path.",
  );
}

const failures = results.filter((result) => !result.passed);
const report = {
  baseUrl: base.origin,
  requests: requests.length,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
  passed: failures.length === 0,
  checks: results.length,
  failures,
};
if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `MealDeck SEO audit: ${results.length - failures.length}/${results.length} checks passed for ${base.origin}`,
  );
  console.log(
    `${requests.length} anonymous public GET requests; concurrency ${CONCURRENCY}; ${TIMEOUT_MS / 1000}s request timeout.`,
  );
  for (const failure of failures)
    console.log(
      `FAIL ${failure.target}\n  ${failure.check}${failure.detail ? `: ${failure.detail}` : ""}`,
    );
  if (!failures.length)
    console.log(
      "All five menu pages, legacy links, sitemap, true 404 and query isolation checks passed.",
    );
  else
    console.log(
      "Exit 1: public responses do not yet satisfy this release's SEO contract. Check the tested build/deployment and failures above.",
    );
}
process.exitCode = failures.length ? 1 : 0;
