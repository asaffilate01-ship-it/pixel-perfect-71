import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Gamepad2, Share2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { gameFoodArtwork } from "@/lib/game-food-artwork";
import { arcadeReceiptSeo } from "@/lib/mealdeck-arcade-pages";
import "@/styles.mealdeck-arcade-pages.css";

export const Route = createFileRoute("/play_/receipt")({
  validateSearch: () => ({}),
  head: () => arcadeReceiptSeo(),
  component: ReceiptPlayPage,
});

const quickGames = [
  {
    id: "snack-trail",
    name: "Snack Trail",
    art: "burger",
    detail: "Collect bites and grow your trail. Choose a moving or untimed round.",
  },
  {
    id: "skewer-sort",
    name: "Skewer Sort",
    art: "chicken",
    detail: "Move one bite at a time and give every food its own skewer.",
  },
  {
    id: "pairs",
    name: "Food Pairs",
    art: "cake",
    detail: "Turn over the cards and find the matching food pairs.",
  },
] as const;

function ReceiptPlayPage() {
  return (
    <div className="md-marketing-shell md-arcade-entry">
      <SiteHeader />
      <main className="md-arcade-entry-main">
        <header className="md-arcade-entry-hero">
          <div>
            <p className="md-arcade-entry-eyebrow">
              <Gamepad2 size={18} aria-hidden="true" /> MealDeck Play
            </p>
            <h1>A little play with your meal.</h1>
            <p>
              Thanks for stopping by. Take a moment for a daily puzzle or a quick game — free to
              play, with no sign-in needed.
            </p>
            <Link to="/play/daily" preload={false} className="md-arcade-entry-button">
              <CalendarDays size={18} aria-hidden="true" /> Try today's daily challenge{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="md-arcade-entry-note">
              A different puzzle each day. Start whenever you are ready.
            </p>
          </div>
          <img src={gameFoodArtwork.burger} alt="" width={230} height={230} />
        </header>
        <section aria-labelledby="receipt-quick-games" className="md-arcade-entry-quick">
          <div className="md-arcade-entry-heading">
            <h2 id="receipt-quick-games">Pick a quick game</h2>
            <Link to="/play">
              See all 19 games <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="md-arcade-entry-games">
            {quickGames.map((game) => (
              <Link
                key={game.id}
                to="/play/$gameId"
                params={{ gameId: game.id }}
                search={{}}
                className="md-arcade-entry-game"
              >
                <img src={gameFoodArtwork[game.art]} alt="" width={65} height={65} />
                <div>
                  <h3>{game.name}</h3>
                  <p>{game.detail}</p>
                  <span>
                    Play {game.name} <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="md-arcade-entry-more" aria-label="More from MealDeck">
          <div>
            <h2>Ready to explore another craving?</h2>
            <p>Browse the MealDeck menus whenever you are ready.</p>
          </div>
          <Link to="/menus" className="md-arcade-entry-button is-quiet">
            Explore the menus <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
        <footer className="md-arcade-entry-footer">
          <p>Games are just for fun. They do not award food, discounts or loyalty points.</p>
          <Link to="/play/promote">
            <Share2 size={17} aria-hidden="true" /> Share &amp; print kit
          </Link>
        </footer>
      </main>
      <SiteFooter />
    </div>
  );
}
