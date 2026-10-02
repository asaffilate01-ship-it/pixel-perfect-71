import mealDeckLogo from "@/assets/mealdeck-card-logo.png";
import backEmblem from "@/assets/mealdeck-back-emblem.png";
import { marketingBrands } from "@/lib/marketing-brands";

const cycleSeconds = 45;
const stepSeconds = cycleSeconds / (marketingBrands.length + 1);

function CardBack({ side }: { side: "left" | "right" }) {
  return (
    <div className={`md-deck-shadow md-deck-shadow-${side}`} aria-hidden="true">
      <img src={backEmblem} alt="" className="md-deck-back-emblem" />
    </div>
  );
}

export function RotatingBrandDeck() {
  const cards = [
    { id: "mealdeck", name: "MealDeck", category: "One Order. Every Craving.", logo: mealDeckLogo, rank: "A", suit: "♦" },
    ...marketingBrands,
  ];

  return (
    <div className="md-deck-stage" aria-label="MealDeck brand card showcase">
      <CardBack side="left" />
      <CardBack side="right" />
      {cards.map((card, index) => {
        const black = card.suit === "♠" || card.suit === "♣";
        return (
          <div
            key={card.id}
            className="md-deck-card"
            style={{ animationDelay: `${index * stepSeconds}s` }}
          >
            <div className={`md-deck-card-inner${black ? " is-black" : ""}`}>
              <span className="md-deck-corner md-deck-corner-tl" aria-hidden="true">
                <b>{card.rank}</b>
                <i>{card.suit}</i>
              </span>
              <span className="md-deck-corner md-deck-corner-br" aria-hidden="true">
                <b>{card.rank}</b>
                <i>{card.suit}</i>
              </span>
              <img src={card.logo} alt="" className={index === 0 ? "md-deck-mealdeck-logo" : "md-deck-brand-logo"} />
              <div className="md-deck-caption">
                <strong>{card.name}</strong>
                <span>{card.category}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
