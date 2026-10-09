import { useEffect, useState } from "react";
import cardFront from "@/assets/mealdeck-card-front.png";
import cardBack from "@/assets/mealdeck-card-back.png";
import { marketingBrands } from "@/lib/marketing-brands";
import { chefTitles, heroFoodDeck } from "@/lib/hero-food-deck";
import burgerSuit from "@/assets/card-suit-burger.png";
import tacoSuit from "@/assets/card-suit-french-taco.png";
import chickenSuit from "@/assets/card-suit-chicken.png";
import cakeSuit from "@/assets/card-suit-cake.png";

const suitArtwork = { burger: burgerSuit, "french-taco": tacoSuit, chicken: chickenSuit, cake: cakeSuit };
const stepSeconds = 3;
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
    const tmp = copy[i];
    const other = copy[j];
    if (tmp === undefined || other === undefined) continue;
    copy[i] = other;
    copy[j] = tmp;
  }
  return copy;
}

export function RotatingBrandDeck() {
  const [introComplete, setIntroComplete] = useState(false);
  // Random starting order each load — shuffled after mount so SSR and the
  // first client render stay identical (no hydration mismatch).
  const [brandOrder, setBrandOrder] = useState(marketingBrands);
  const logoCard = { id: "mealdeck", name: "MealDeck", category: "One Order. Every Craving.", logo: cardFront, rank: "M", suit: "burger" as const };
  const brandCards = heroFoodDeck.map((foodCard, index) => {
    const brand = brandOrder[index % brandOrder.length];
    return { ...brand, ...foodCard, name: brand?.name ?? "MealDeck", category: brand?.category ?? "", logo: brand?.logo ?? cardFront };
  });
  // Show every restaurant once in the opening fan; the full four-suit deck
  // follows, with the MealDeck artwork as a separate title card.
  const cards = [logoCard, ...(introComplete ? brandCards : brandCards.slice(0, brandOrder.length))];

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
        const centeredIndex = index - (cards.length - 1) / 2;
        return (
          <div
            key={`${introComplete ? "cycle" : "intro"}-${card.id}`}
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
              className={`md-deck-card-inner${isMealDeck ? " is-mealdeck" : ""}`}
              aria-label={`${card.name}${isMealDeck ? "" : `, ${chefTitles[card.rank] ?? card.rank} of ${card.suit}`}`}
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
                    <img src={suitArtwork[card.suit]} alt="" className="md-deck-food-suit" />
                  </span>
                  <span className="md-deck-corner md-deck-corner-br" aria-hidden="true">
                    <b>{card.rank}</b>
                    <img src={suitArtwork[card.suit]} alt="" className="md-deck-food-suit" />
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
