import { MEALDECK_BUSINESS } from "./business-identity";
import { MEALDECK_LAUNCH_DAYS } from "./mealdeck-launch-schedule";

export const SITE_URL = "https://mealdeck.co.uk";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const SITE_DESCRIPTION =
  "Food in Luton from Skorch, Tavo Chicken, Souvano, Load’d and Moktl. Burgers, chicken, Greek and Turkish food, loaded fries, mac and cheese and mocktails.";

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
  return /^\/(?:account|checkout|group-order|group-pay|track|ops|kds|printer|auth|api)(?:\/|$)/i.test(
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
  url: `${SITE_URL}/luton`,
  image: OG_IMAGE,
  parentOrganization: { "@id": `${SITE_URL}/#organization` },
  servesCuisine: [
    "Smash burgers",
    "Chicken",
    "Greek",
    "Turkish",
    "Loaded fries",
    "Mac and cheese",
    "Mocktails",
  ],
  hasMenu: `${SITE_URL}/menus`,
  description:
    "MealDeck’s first kitchen brings Skorch burgers, Tavo chicken, Souvano Greek and Turkish food, Load’d loaded fries and mac and cheese, and Moktl mocktails to Luton. Opening weekend: 6–8 November 2026. Collection and kerbside; delivery is unavailable. Check checkout for current ordering availability.",
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
      legalName: MEALDECK_BUSINESS.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
      slogan: MEALDECK_BUSINESS.tagline,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: MEALDECK_BUSINESS.tradingName,
      url: SITE_URL,
      inLanguage: "en-GB",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    lutonBusiness,
  ],
};

export const ldScript = (data: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(data).replace(/</g, "\\u003c"),
});
