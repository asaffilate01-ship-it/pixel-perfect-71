import { createFileRoute } from "@tanstack/react-router";
import { MealDeckHomepage } from "@/components/mealdeck-homepage";
import homepageCss from "../homepage.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MealDeck — One Order. Every Craving." },
      {
        name: "description",
        content:
          "Explore the MealDeck collection: parathas, French tacos, chicken, burgers, curry and drinks. Pick your favourites and discover the offers deck. Online ordering coming soon.",
      },
      { property: "og:title", content: "MealDeck — One Order. Every Craving." },
      {
        property: "og:description",
        content:
          "Many brands. One very good idea. Explore MealDeck's food and drink cards and discover what's coming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: homepageCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&display=swap",
      },
    ],
  }),
  component: MealDeckHomepage,
});
