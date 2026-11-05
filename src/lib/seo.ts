import { MEALDECK_BUSINESS } from "./business-identity";
import { COMING_SOON } from "./launch-status";
import { isMealDeckLaunchLocation } from "./mealdeck-launch-locations";
import { MEALDECK_LAUNCH_DAYS } from "./mealdeck-launch-schedule";

export const SITE_URL = "https://mealdeck.co.uk";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

type SeoInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
  keywords?: string;
};

export function seo({
  title,
  description,
  path,
  image = OG_IMAGE,
  type = "website",
  keywords,
}: SeoInput) {
  const url = `${SITE_URL}${path}`;
  const usesMasterArtwork = image === OG_IMAGE;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      ...(keywords ? [{ name: "keywords", content: keywords }] : []),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
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
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

const business = (town: string, extra: Record<string, unknown> = {}) => {
  const launchLocation = isMealDeckLaunchLocation(town.toLowerCase().replace(/\s+/g, ""));
  const orderingOpen = launchLocation && !COMING_SOON;
  return {
    "@type": "Restaurant",
    name: `MealDeck ${town}`,
    url: `${SITE_URL}/${town.toLowerCase().replace(" ", "-")}`,
    image: OG_IMAGE,
    ...(launchLocation
      ? {
          servesCuisine: [
            "Smash burgers",
            "Chicken",
            "Mediterranean grill",
            "Loaded fries",
            "Mac and cheese",
            "Mocktails",
          ],
          hasMenu: `${SITE_URL}/menus`,
        }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: town,
      addressRegion: town === "Luton" ? "Bedfordshire" : "Hertfordshire",
      addressCountry: "GB",
    },
    acceptsReservations: false,
    priceRange: "££",
    ...(orderingOpen
      ? {
          areaServed: { "@type": "City", name: town },
          potentialAction: { "@type": "OrderAction", target: `${SITE_URL}/order` },
        }
      : {}),
    description: launchLocation
      ? `MealDeck's first launch kitchen: Skorch, Tavo Chicken, Souvano, Load’d and Moktl in Luton.${COMING_SOON ? " Ordering is coming soon." : ""}`
      : `MealDeck ${town} is coming in a future deck. Luton launches first; this location's date and menu will be confirmed separately.`,
    ...extra,
  };
};

export const lutonBusiness = business("Luton", {
  address: {
    "@type": "PostalAddress",
    streetAddress: "314–318 Selbourne Road",
    addressLocality: "Luton",
    addressRegion: "Bedfordshire",
    postalCode: "LU4 8NU",
    addressCountry: "GB",
  },
  // These confirmed dates describe one opening weekend, not recurring daily
  // hours or permission to place an order. The OrderAction keeps its own gate.
  specialOpeningHoursSpecification: MEALDECK_LAUNCH_DAYS.map((day) => ({
    "@type": "OpeningHoursSpecification",
    validFrom: day.date,
    validThrough: day.date,
    opens: day.opensAt.slice(11, 19),
    closes: day.closesAt.slice(11, 19),
  })),
});
export const stAlbansBusiness = business("St Albans", {
  address: {
    "@type": "PostalAddress",
    streetAddress: "Café 1, St Albans Crown Court, 6 Bricket Road",
    addressLocality: "St Albans",
    addressRegion: "Hertfordshire",
    postalCode: "AL1 3JU",
    addressCountry: "GB",
  },
});

export const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: MEALDECK_BUSINESS.tradingName,
      legalName: MEALDECK_BUSINESS.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
      slogan: "One Order. Every Craving.",
    },
    { "@type": "WebSite", name: "MealDeck", url: SITE_URL },
    lutonBusiness,
    stAlbansBusiness,
  ],
};

export const ldScript = (data: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(data),
});
