import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MEALDECK_BUSINESS } from "../src/lib/business-identity";
import { ARCADE_GAME_PAGES } from "../src/lib/mealdeck-arcade-pages";
import { MEALDECK_PUBLIC_PATHS, mealDeckSitemap } from "../src/lib/mealdeck-sitemap";
import { MEALDECK_MENU_PAGES, getMealDeckMenuPage } from "../src/lib/mealdeck-menu-seo";
import {
  SITE_URL,
  canonicalUrl,
  isPrivateSeoPath,
  ldScript,
  lutonBusiness,
  menuPageJsonLd,
  orgJsonLd,
  seo,
  stAlbansPageJsonLd,
} from "../src/lib/seo";

const metadata = (path: string) => seo({ title: "MealDeck", description: "Food in Luton", path });

describe("public MealDeck search identity", () => {
  test("uses the supplied domain, tagline and confirmed social handle", () => {
    expect(SITE_URL).toBe("https://mealdeck.co.uk");
    expect(MEALDECK_BUSINESS.tagline).toBe("One order, every craving");
    expect(MEALDECK_BUSINESS.socialHandle).toBe("@mealdeckofficial");
  });

  test("canonical and social URLs discard private and campaign URL data", () => {
    const value = metadata("/group-pay?room=private-room&utm_source=mail#share=private-key");
    expect(value.links).toEqual([{ rel: "canonical", href: "https://mealdeck.co.uk/group-pay" }]);
    expect(value.meta).toContainEqual({
      property: "og:url",
      content: "https://mealdeck.co.uk/group-pay",
    });
    expect(JSON.stringify(value)).not.toContain("private-");
    expect(canonicalUrl("/")).toBe("https://mealdeck.co.uk/");
    for (const path of ["https://other.example/", "//other.example/", "/\\other.example/", "menus"])
      expect(() => canonicalUrl(path)).toThrow();
  });

  test("image metadata matches the existing approved asset and includes accessible descriptions", () => {
    const value = metadata("/luton");
    const png = readFileSync(new URL("../public/og-image.png", import.meta.url));
    expect(value.meta).toContainEqual({
      property: "og:image:width",
      content: String(png.readUInt32BE(16)),
    });
    expect(value.meta).toContainEqual({
      property: "og:image:height",
      content: String(png.readUInt32BE(20)),
    });
    expect(value.meta).toContainEqual({ property: "og:locale", content: "en_GB" });
    expect(value.meta).toContainEqual({
      name: "twitter:image:alt",
      content: "MealDeck brand artwork",
    });
    // The owner supplied no X account, so the social handle is not invented as one.
    expect(value.meta.some((entry) => "name" in entry && entry.name === "twitter:site")).toBe(
      false,
    );
  });
});

describe("private routes stay out of search discovery", () => {
  test("account, checkout, rooms, auth confirmation and staff pages default to noindex", () => {
    for (const path of [
      "/account",
      "/checkout?order=private",
      "/whatsapp/checkout#token=private",
      "/group-order",
      "/group-pay",
      "/track",
      "/ops",
      "/kds",
      "/printer",
      "/auth/confirm#private",
      "/api/group-payments",
    ])
      expect(metadata(path).meta).toContainEqual({
        name: "robots",
        content: "noindex, nofollow, noarchive",
      });
    expect(isPrivateSeoPath("/offers")).toBe(false);
    expect(isPrivateSeoPath("/blog/group-food-order")).toBe(false);
    expect(isPrivateSeoPath("/accounting")).toBe(false);
    expect(
      seo({
        title: "Future private page",
        description: "Private",
        path: "/new-private",
        noIndex: true,
      }).meta,
    ).toContainEqual({ name: "robots", content: "noindex, nofollow, noarchive" });
  });

  test("sitemap includes public offers and games, with unique canonical URLs and no private destinations", () => {
    for (const path of [
      "/offers",
      "/opening-offer",
      "/meta-ad",
      "/play",
      "/play/daily",
      "/play/receipt",
      "/play/promote",
      "/luton",
      "/menus",
      ...MEALDECK_MENU_PAGES.map((page) => page.path),
      ...ARCADE_GAME_PAGES.map((game) => game.path),
    ])
      expect(MEALDECK_PUBLIC_PATHS).toContain(path);
    expect(MEALDECK_PUBLIC_PATHS.some(isPrivateSeoPath)).toBe(false);
    const urls = [...mealDeckSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
    expect(urls.length).toBe(MEALDECK_PUBLIC_PATHS.length);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => new URL(url).origin === SITE_URL)).toBe(true);
    expect(urls.every((url) => !new URL(url).search && !new URL(url).hash)).toBe(true);
    expect(urls.some((url) => url.includes("/auth/confirm"))).toBe(false);
  });
});

describe("distinct crawlable brand menus", () => {
  test("only the five real menus have local landing pages, with unique search identities", () => {
    expect(MEALDECK_MENU_PAGES).toHaveLength(5);
    for (const field of ["brandId", "path", "title", "heading", "description"] as const)
      expect(new Set(MEALDECK_MENU_PAGES.map((page) => page[field])).size).toBe(5);
    for (const page of MEALDECK_MENU_PAGES) {
      expect(getMealDeckMenuPage(page.brandId)).toBe(page);
      expect(page.title).toContain("Luton");
      expect(page.heading).toContain("Luton");
      expect(seo(page).links).toEqual([{ rel: "canonical", href: SITE_URL + page.path }]);
      expect(lutonBusiness.hasMenu).toContain(SITE_URL + page.path);
      expect(mealDeckSitemap()).toContain(`<loc>${SITE_URL}${page.path}</loc>`);
      expect(page.title).not.toContain("Wingstop");
    }
    for (const unknown of [
      undefined,
      "wingstop",
      "paratique",
      "__proto__",
      "loadd/orders",
      "LOAdd",
    ])
      expect(getMealDeckMenuPage(unknown)).toBeUndefined();
    expect(MEALDECK_PUBLIC_PATHS).not.toContain("/order");
  });

  test("menu and breadcrumb markup describe the same canonical page without price or affiliation claims", () => {
    for (const page of MEALDECK_MENU_PAGES) {
      const graph = menuPageJsonLd(page)["@graph"];
      const menu = graph.find((entry) => entry["@type"] === "Menu")!;
      const webpage = graph.find((entry) => entry["@type"] === "WebPage")!;
      const breadcrumb = graph.find((entry) => entry["@type"] === "BreadcrumbList")!;
      expect(menu.url).toBe(SITE_URL + page.path);
      expect(webpage.mainEntity).toEqual({ "@id": menu["@id"] });
      expect(breadcrumb.itemListElement?.at(-1)).toEqual({
        "@type": "ListItem",
        position: 3,
        name: page.brandName,
        item: menu.url,
      });
      const text = JSON.stringify(graph);
      for (const absent of [
        "Wingstop",
        "aggregateRating",
        "OrderAction",
        "priceCurrency",
        "InStock",
      ])
        expect(text).not.toContain(absent);
    }
  });

  test("space-separated brand alias and public social profiles identify the real business", () => {
    const organisation = orgJsonLd["@graph"].find((entry) => entry["@type"] === "Organization")!;
    const website = orgJsonLd["@graph"].find((entry) => entry["@type"] === "WebSite")!;
    expect(organisation.alternateName).toBe("Meal Deck");
    expect(website.alternateName).toBe("Meal Deck");
    expect(lutonBusiness.alternateName).toBe("Meal Deck Luton");
    expect(organisation.sameAs).toEqual([
      "https://www.instagram.com/mealdeckofficial/",
      "https://www.tiktok.com/@mealdeckofficial",
    ]);
  });
});

describe("structured data reflects confirmed launch facts", () => {
  test("only Luton is a Restaurant, with exact dated hours and no invented ratings or live OrderAction", () => {
    const restaurants = orgJsonLd["@graph"].filter((entry) => entry["@type"] === "Restaurant");
    expect(restaurants).toHaveLength(1);
    expect(lutonBusiness.address.streetAddress).toBe("314–318 Selbourne Road");
    expect(
      lutonBusiness.specialOpeningHoursSpecification.map(
        ({ validFrom, validThrough, opens, closes }) => ({
          validFrom,
          validThrough,
          opens,
          closes,
        }),
      ),
    ).toEqual([
      {
        validFrom: "2026-11-06",
        validThrough: "2026-11-06",
        opens: "15:00:00",
        closes: "00:00:00",
      },
      {
        validFrom: "2026-11-07",
        validThrough: "2026-11-07",
        opens: "15:00:00",
        closes: "00:00:00",
      },
      {
        validFrom: "2026-11-08",
        validThrough: "2026-11-08",
        opens: "15:00:00",
        closes: "23:00:00",
      },
    ]);
    // Regular hours have since been confirmed for Luton. These schema rows
    // describe the published schedule, not a claim that checkout is open now.
    expect(lutonBusiness.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"],
        opens: "17:00:00",
        closes: "23:00:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Friday", "Saturday", "Sunday"],
        opens: "16:00:00",
        closes: "23:00:00",
      },
    ]);
    expect(stAlbansPageJsonLd["@type"]).toBe("WebPage");
    expect(stAlbansPageJsonLd.name).toContain("Coming soon");
    for (const unsupported of [
      "aggregateRating",
      "reviewCount",
      "OrderAction",
      "priceRange",
    ])
      expect(JSON.stringify(orgJsonLd)).not.toContain('"' + unsupported + '"');
  });

  test("JSON-LD text cannot terminate its script element", () => {
    const value = { description: "</script><script>untrusted</script>" };
    const script = ldScript(value);
    expect(script.children).not.toContain("</script>");
    expect(JSON.parse(script.children)).toEqual(value);
  });
});
