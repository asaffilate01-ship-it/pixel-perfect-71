export const SITE_URL = "https://mealdeck.co.uk";
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

type SeoInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: string;
  keywords?: string;
};

export function seo({ title, description, path, image = OG_IMAGE, type = "website", keywords }: SeoInput) {
  const url = `${SITE_URL}${path}`;
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
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

const business = (town: string, extra: Record<string, unknown> = {}) => ({
  "@type": "Restaurant",
  name: `MealDeck ${town}`,
  url: `${SITE_URL}/${town.toLowerCase().replace(" ", "-")}`,
  image: OG_IMAGE,
  servesCuisine: ["French tacos", "Smash burgers", "Chicken", "Desi", "Indian vegetarian", "Parathas", "Grill", "Kebab", "Fresh juices", "Iced coffee", "Mocktails"],
  address: { "@type": "PostalAddress", addressLocality: town, addressRegion: town === "Luton" ? "Bedfordshire" : "Hertfordshire", addressCountry: "GB" },
  areaServed: { "@type": "City", name: town },
  hasMenu: `${SITE_URL}/order`,
  acceptsReservations: false,
  priceRange: "££",
  potentialAction: { "@type": "OrderAction", target: `${SITE_URL}/order` },
  description: `Multi-brand food delivery in ${town}. One basket, one delivery fee.`,
  ...extra,
});

export const lutonBusiness = business("Luton", {
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "17:00", closes: "23:00" }],
});
export const stAlbansBusiness = business("St Albans", {
  address: { "@type": "PostalAddress", streetAddress: "Café 1, 6 Bricket Road", addressLocality: "St Albans", addressRegion: "Hertfordshire", postalCode: "AL1 3JU", addressCountry: "GB" },
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "16:00" }],
});

export const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "MealDeck", url: SITE_URL, logo: `${SITE_URL}/favicon.png`, slogan: "One Order. Every Craving." },
    { "@type": "WebSite", name: "MealDeck", url: SITE_URL },
    lutonBusiness,
    stAlbansBusiness,
  ],
};

export const ldScript = (data: unknown) => ({ type: "application/ld+json", children: JSON.stringify(data) });
