import { useEffect, useState } from "react";
import cardFront from "@/assets/mealdeck-card-front.png";
import cardBack from "@/assets/mealdeck-card-back.png";
import { marketingBrands } from "@/lib/marketing-brands";

const cycleSeconds = 45;
const stepSeconds = cycleSeconds / (marketingBrands.length + 1);
const introDuration = 4600;

function CardBack({ side }: { side: "left" | "right" }) {
  return (
    <div className={`md-deck-shadow md-deck-shadow-${side}`} aria-hidden="true">
      <img src={cardBack} alt="" className="md-deck-back-art" />
    </div>
  );
}

function shuffleBrands<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function RotatingBrandDeck() {
  const [introComplete, setIntroComplete] = useState(false);
  // Random starting order each load — shuffled after mount so SSR and the
  // first client render stay identical (no hydration mismatch).
  const [brandOrder, setBrandOrder] = useState(marketingBrands);
  const cards = [
    { id: "mealdeck", name: "MealDeck", category: "One Order. Every Craving.", logo: cardFront, rank: "M", suit: "cutlery" },
    ...brandOrder,
  ];

  useEffect(() => {
    setBrandOrder(shuffleBrands(marketingBrands));
    const timer = window.setTimeout(() => setIntroComplete(true), introDuration);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`md-deck-stage ${introComplete ? "is-cycling" : "is-gathering"}`}
      aria-label="Restaurant brand cards gathering into one MealDeck order"
    >
      <CardBack side="left" />
      <CardBack side="right" />
      {cards.map((card, index) => {
        const isMealDeck = index === 0;
        const black = card.suit === "🍟" || card.suit === "🥤";
        const centeredIndex = index - (cards.length - 1) / 2;
        return (
          <div
            key={card.id}
            className="md-deck-card"
            style={{
              "--card-delay": `${index * stepSeconds}s`,
              "--fan-x": `${centeredIndex * 15}px`,
              "--fan-y": `${Math.abs(centeredIndex) * 3.2}px`,
              "--fan-rotate": `${centeredIndex * 4.2}deg`,
              "--fan-z": `${cards.length - Math.abs(centeredIndex)}`,
            } as React.CSSProperties}
          >
            <div
              className={`md-deck-card-inner${black ? " is-black" : ""}${isMealDeck ? " is-mealdeck" : ""}`}
            >
              {isMealDeck ? (
                <img
                  src={card.logo}
                  alt="MealDeck — One Order. Every Craving."
                  className="md-deck-card-art"
                />
              ) : (
                <>
                  <span className="md-deck-corner md-deck-corner-tl" aria-hidden="true">
                    <b>{card.rank}</b>
                    <i>{card.suit}</i>
                  </span>
                  <span className="md-deck-corner md-deck-corner-br" aria-hidden="true">
                    <b>{card.rank}</b>
                    <i>{card.suit}</i>
                  </span>
                  <img src={card.logo} alt="" className="md-deck-brand-logo" />
                  <div className="md-deck-caption">
                    <strong>{card.name}</strong>
                    <span>{card.category}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
