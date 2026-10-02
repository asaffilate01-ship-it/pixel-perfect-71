import { useEffect, useState } from "react";
import backEmblem from "@/assets/mealdeck-back-emblem.png";
import mealDeckEmblem from "@/assets/mealdeck-vintage-emblem.png.asset.json";
import { marketingBrands } from "@/lib/marketing-brands";

const cycleSeconds = 45;
const stepSeconds = cycleSeconds / (marketingBrands.length + 1);
const introDuration = 4600;

function CutlerySuit() {
  return (
    <svg viewBox="0 0 24 24" className="md-deck-suit-cutlery" aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path
          d="M8.1 2.6v4.4M12 2.2v4.8M15.9 2.6v4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path d="M12 7.2v13.6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g transform="rotate(-45 12 12)">
        <path d="M12 21.4V7.6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M12 2.4c2.7 1.5 4 3.6 4 5.6H12V2.4z" fill="currentColor" />
      </g>
    </svg>
  );
}

function CardBack({ side }: { side: "left" | "right" }) {
  return (
    <div className={`md-deck-shadow md-deck-shadow-${side}`} aria-hidden="true">
      <img src={backEmblem} alt="" className="md-deck-back-emblem" />
    </div>
  );
}

export function RotatingBrandDeck() {
  const [introComplete, setIntroComplete] = useState(false);
  const cards = [
    { id: "mealdeck", name: "MealDeck", category: "One Order. Every Craving.", logo: mealDeckEmblem.url, rank: "M", suit: "cutlery" },
    ...marketingBrands,
  ];

  useEffect(() => {
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
        const black = card.suit === "♠" || card.suit === "♣";
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
            <div className={`md-deck-card-inner${black ? " is-black" : ""}`}>
              <span className="md-deck-corner md-deck-corner-tl" aria-hidden="true">
                <b>{card.rank}</b>
                <i>{card.suit === "cutlery" ? <CutlerySuit /> : card.suit}</i>
              </span>
              <span className="md-deck-corner md-deck-corner-br" aria-hidden="true">
                <b>{card.rank}</b>
                <i>{card.suit === "cutlery" ? <CutlerySuit /> : card.suit}</i>
              </span>
              <img src={card.logo} alt="" className={index === 0 ? "md-deck-mealdeck-logo" : "md-deck-brand-logo"} />
              {index !== 0 && (
                <div className="md-deck-caption">
                  <strong>{card.name}</strong>
                  <span>{card.category}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
