import { MEALDECK_BUSINESS } from "./business-identity";
import { MEALDECK_LAUNCH_DAYS } from "./mealdeck-launch-schedule";
import { MEALDECK_MENU_PAGES, type MealDeckMenuPage } from "./mealdeck-menu-seo";

export const SITE_URL = "https://mealdeck.co.uk";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const SITE_DESCRIPTION =
  "MealDeck Luton: smash burgers, chicken wings, loaded fries, doner, mocktails and milk cake. Mix five menus in one order for collection or kerbside pickup.";

/** Page canonicals never include basket, invitation, account or campaign data. */
export function canonicalUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("A canonical URL needs a local page path.");
  const url = new URL(path, SITE_URL);
  if (url.origin !== SITE_URL) throw new Error("A canonical URL must use the MealDeck domain.");
  url.search = "";
  url.hash = "";
  return url.href;
}

export function isPrivateSeoPath(path: string) {
  const pathname = new URL(canonicalUrl(path)).pathname;
  return /^\/(?:account|checkout|whatsapp|group-order|group-pay|track|ops|kds|printer|auth|api)(?:\/|$)/i.test(
    pathname,
  );
}

type SeoInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  type?: string;
  keywords?: string;
  noIndex?: boolean;
};

export function seo({
  title,
  description,
  path,
  image = OG_IMAGE,
  imageAlt,
  type = "website",
  keywords,
  noIndex = false,
}: SeoInput) {
  const url = canonicalUrl(path);
  const usesMasterArtwork = image === OG_IMAGE;
  const artworkDescription = imageAlt ?? (usesMasterArtwork ? "MealDeck brand artwork" : title);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(noIndex || isPrivateSeoPath(path)
        ? [{ name: "robots", content: "noindex, nofollow, noarchive" }]
        : []),
      ...(keywords ? [{ name: "keywords", content: keywords }] : []),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:site_name", content: MEALDECK_BUSINESS.tradingName },
      { property: "og:locale", content: "en_GB" },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: artworkDescription },
      ...(usesMasterArtwork
        ? [
            { property: "og:image:width", content: "1106" },
            { property: "og:image:height", content: "1116" },
          ]
        : []),
      { name: "twitter:card", content: usesMasterArtwork ? "summary" : "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: artworkDescription },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export const lutonBusiness = {
  "@type": "Restaurant",
  "@id": `${SITE_URL}/luton#restaurant`,
  name: "MealDeck Luton",
  alternateName: "Meal Deck Luton",
  url: `${SITE_URL}/luton`,
  image: OG_IMAGE,
  parentOrganization: { "@id": `${SITE_URL}/#organization` },
  servesCuisine: [
    "Smash burgers",
    "Chicken",
    "Chicken wings",
    "Greek",
    "Turkish",
    "Loaded fries",
    "Mac and cheese",
    "Mocktails",
    "Desserts",
  ],
  hasMenu: MEALDECK_MENU_PAGES.map((page) => `${SITE_URL}${page.path}`),
  description:
    "MealDeck Luton brings Skorch smash burgers, Tavo Chicken wings and tenders, Souvano doner and lamb chops, Load’d loaded fries and mac and cheese, Moktl mocktails and milk cake together for collection or kerbside. Check the menus and checkout for current availability.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "314–318 Selbourne Road",
    addressLocality: "Luton",
    addressRegion: "Bedfordshire",
    postalCode: "LU4 8NU",
    addressCountry: "GB",
  },
  // These confirmed dates describe one opening weekend, not recurring daily
  // hours or permission to place an order. Static SEO cannot assert live ordering.
  specialOpeningHoursSpecification: MEALDECK_LAUNCH_DAYS.map((day) => ({
    "@type": "OpeningHoursSpecification",
    validFrom: day.date,
    validThrough: day.date,
    opens: day.opensAt.slice(11, 19),
    closes: day.closesAt.slice(11, 19),
  })),
};

// A future location is an informational page, not an operating Restaurant.
export const stAlbansPageJsonLd = {
  "@type": "WebPage",
  "@id": `${SITE_URL}/st-albans#webpage`,
  name: "MealDeck St Albans — Coming soon",
  url: `${SITE_URL}/st-albans`,
  description:
    "St Albans is a future MealDeck location. Its opening date, menu and delivery area will be confirmed separately; Luton launches first.",
  isPartOf: { "@id": `${SITE_URL}/#website` },
};

export const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: MEALDECK_BUSINESS.tradingName,
      alternateName: "Meal Deck",
      legalName: MEALDECK_BUSINESS.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
      slogan: MEALDECK_BUSINESS.tagline,
      sameAs: [
        `https://www.instagram.com/${MEALDECK_BUSINESS.socialHandle.slice(1)}/`,
        `https://www.tiktok.com/${MEALDECK_BUSINESS.socialHandle}`,
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: MEALDECK_BUSINESS.tradingName,
      alternateName: "Meal Deck",
      url: SITE_URL,
      inLanguage: "en-GB",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    lutonBusiness,
  ],
};

/** Menus describe the visible brand page, without inventing stock, prices or reviews. */
export function menuPageJsonLd(page: MealDeckMenuPage) {
  const url = canonicalUrl(page.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "en-GB",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${url}#menu` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "Menu",
        "@id": `${url}#menu`,
        name: `${page.brandName} menu — MealDeck Luton`,
        description: page.intro,
        url,
        inLanguage: "en-GB",
        mainEntityOfPage: { "@id": `${url}#webpage` },
        about: { "@id": `${SITE_URL}/luton#restaurant` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "MealDeck", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Luton menus", item: `${SITE_URL}/menus` },
          { "@type": "ListItem", position: 3, name: page.brandName, item: url },
        ],
      },
    ],
  };
}

export const ldScript = (data: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(data).replace(/</g, "\\u003c"),
});
